-- Private diary knowledge index for administrator-only semantic search.
BEGIN;

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE public.knowledge_source_settings (
  source_id BIGINT PRIMARY KEY REFERENCES public."diaryContent"(id) ON DELETE CASCADE,
  usage_scope TEXT NOT NULL DEFAULT 'private' CHECK (usage_scope IN ('private', 'excluded')),
  indexed_content_hash TEXT CHECK (indexed_content_hash IS NULL OR indexed_content_hash ~ '^[0-9a-f]{64}$'),
  indexed_model TEXT,
  last_indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.knowledge_chunks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES public."diaryContent"(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  source_date DATE NOT NULL,
  source_title TEXT,
  content TEXT NOT NULL CHECK (length(content) > 0),
  char_start INTEGER NOT NULL CHECK (char_start >= 0),
  char_end INTEGER NOT NULL CHECK (char_end > char_start),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  embedding extensions.vector(1024) NOT NULL,
  embedding_model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, chunk_index)
);

CREATE INDEX knowledge_chunks_source_id_idx ON public.knowledge_chunks (source_id);
CREATE INDEX knowledge_chunks_source_date_idx ON public.knowledge_chunks (source_date DESC);

CREATE TABLE public.knowledge_index_jobs (
  source_id BIGINT PRIMARY KEY REFERENCES public."diaryContent"(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX knowledge_index_jobs_pending_queue_idx
  ON public.knowledge_index_jobs (queued_at, source_id)
  WHERE status = 'pending';
CREATE INDEX knowledge_index_jobs_processing_started_idx
  ON public.knowledge_index_jobs (started_at, source_id)
  WHERE status = 'processing';

ALTER TABLE public.knowledge_source_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_index_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.knowledge_source_settings,
  public.knowledge_chunks,
  public.knowledge_index_jobs
FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.knowledge_chunks_id_seq FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.knowledge_source_settings,
  public.knowledge_chunks,
  public.knowledge_index_jobs
TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.knowledge_chunks_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.queue_diary_knowledge_index()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.knowledge_source_settings (source_id)
  VALUES (NEW.id)
  ON CONFLICT (source_id) DO NOTHING;

  INSERT INTO public.knowledge_index_jobs (
    source_id,
    status,
    queued_at,
    started_at,
    completed_at,
    last_error,
    updated_at
  )
  VALUES (NEW.id, 'pending', now(), NULL, NULL, NULL, now())
  ON CONFLICT (source_id) DO UPDATE SET
    status = 'pending',
    queued_at = EXCLUDED.queued_at,
    started_at = NULL,
    completed_at = NULL,
    last_error = NULL,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_diary_knowledge_index() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_diary_knowledge_index() TO service_role;

CREATE TRIGGER diary_knowledge_index_queue
AFTER INSERT OR UPDATE OF date, subtitle, content
ON public."diaryContent"
FOR EACH ROW
EXECUTE FUNCTION public.queue_diary_knowledge_index();

CREATE OR REPLACE FUNCTION public.claim_knowledge_index_jobs(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(source_id BIGINT)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH candidates AS (
    SELECT job.source_id
    FROM public.knowledge_index_jobs AS job
    WHERE job.status = 'pending'
       OR (job.status = 'processing' AND job.started_at < now() - interval '10 minutes')
    ORDER BY job.queued_at, job.source_id
    FOR UPDATE SKIP LOCKED
    LIMIT least(greatest(coalesce(p_limit, 10), 1), 25)
  ), claimed AS (
    UPDATE public.knowledge_index_jobs AS job
    SET status = 'processing',
        attempts = job.attempts + 1,
        started_at = now(),
        completed_at = NULL,
        last_error = NULL,
        updated_at = now()
    FROM candidates
    WHERE job.source_id = candidates.source_id
    RETURNING job.source_id
  )
  SELECT claimed.source_id FROM claimed;
$$;

REVOKE ALL ON FUNCTION public.claim_knowledge_index_jobs(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_knowledge_index_jobs(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.replace_diary_knowledge_chunks(
  p_source_id BIGINT,
  p_source_date DATE,
  p_source_title TEXT,
  p_source_hash TEXT,
  p_embedding_model TEXT,
  p_chunks JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_source_hash IS NULL
     OR p_source_hash !~ '^[0-9a-f]{64}$'
     OR p_embedding_model IS NULL
     OR p_embedding_model = ''
     OR p_chunks IS NULL
     OR jsonb_typeof(p_chunks) <> 'array' THEN
    RAISE EXCEPTION 'Invalid knowledge index payload';
  END IF;

  INSERT INTO public.knowledge_source_settings (source_id)
  VALUES (p_source_id)
  ON CONFLICT (source_id) DO NOTHING;

  IF (SELECT setting.usage_scope
      FROM public.knowledge_source_settings AS setting
      WHERE setting.source_id = p_source_id) = 'excluded' THEN
    DELETE FROM public.knowledge_chunks WHERE source_id = p_source_id;
  ELSE
    DELETE FROM public.knowledge_chunks WHERE source_id = p_source_id;

    INSERT INTO public.knowledge_chunks (
      source_id,
      chunk_index,
      source_date,
      source_title,
      content,
      char_start,
      char_end,
      content_hash,
      embedding,
      embedding_model,
      updated_at
    )
    SELECT
      p_source_id,
      item.chunk_index,
      p_source_date,
      p_source_title,
      item.content,
      item.char_start,
      item.char_end,
      item.content_hash,
      item.embedding::text::extensions.vector(1024),
      p_embedding_model,
      now()
    FROM jsonb_to_recordset(p_chunks) AS item(
      chunk_index INTEGER,
      content TEXT,
      char_start INTEGER,
      char_end INTEGER,
      content_hash TEXT,
      embedding JSONB
    );
  END IF;

  UPDATE public.knowledge_source_settings
  SET indexed_content_hash = p_source_hash,
      indexed_model = p_embedding_model,
      last_indexed_at = now(),
      updated_at = now()
  WHERE source_id = p_source_id;

  UPDATE public.knowledge_index_jobs
  SET status = 'completed',
      completed_at = now(),
      last_error = NULL,
      updated_at = now()
  WHERE source_id = p_source_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_diary_knowledge_chunks(BIGINT, DATE, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_diary_knowledge_chunks(BIGINT, DATE, TEXT, TEXT, TEXT, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.search_private_knowledge(
  p_query_embedding extensions.vector(1024),
  p_query_text TEXT,
  p_match_count INTEGER DEFAULT 10,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  chunk_id BIGINT,
  source_id BIGINT,
  chunk_index INTEGER,
  source_date DATE,
  source_title TEXT,
  content TEXT,
  char_start INTEGER,
  char_end INTEGER,
  similarity DOUBLE PRECISION,
  score DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH eligible AS (
    SELECT chunk.*
    FROM public.knowledge_chunks AS chunk
    JOIN public.knowledge_source_settings AS setting ON setting.source_id = chunk.source_id
    WHERE setting.usage_scope = 'private'
      AND (p_start_date IS NULL OR chunk.source_date >= p_start_date)
      AND (p_end_date IS NULL OR chunk.source_date <= p_end_date)
  ), semantic AS (
    SELECT
      eligible.id,
      row_number() OVER (
        ORDER BY eligible.embedding OPERATOR(extensions.<=>) p_query_embedding, eligible.id
      ) AS rank_index,
      1 - (eligible.embedding OPERATOR(extensions.<=>) p_query_embedding) AS similarity
    FROM eligible
    ORDER BY eligible.embedding OPERATOR(extensions.<=>) p_query_embedding, eligible.id
    LIMIT least(greatest(coalesce(p_match_count, 10) * 4, 20), 100)
  ), keyword AS (
    SELECT
      eligible.id,
      row_number() OVER (ORDER BY eligible.source_date DESC, eligible.id) AS rank_index
    FROM eligible
    WHERE length(trim(p_query_text)) > 0
      AND (
        strpos(lower(eligible.content), lower(trim(p_query_text))) > 0
        OR strpos(lower(coalesce(eligible.source_title, '')), lower(trim(p_query_text))) > 0
      )
    ORDER BY eligible.source_date DESC, eligible.id
    LIMIT least(greatest(coalesce(p_match_count, 10) * 4, 20), 100)
  ), fused AS (
    SELECT
      coalesce(semantic.id, keyword.id) AS id,
      semantic.similarity,
      coalesce(1.0 / (50 + semantic.rank_index), 0.0)
        + 1.25 * coalesce(1.0 / (50 + keyword.rank_index), 0.0) AS score
    FROM semantic
    FULL OUTER JOIN keyword ON keyword.id = semantic.id
  )
  SELECT
    chunk.id,
    chunk.source_id,
    chunk.chunk_index,
    chunk.source_date,
    chunk.source_title,
    chunk.content,
    chunk.char_start,
    chunk.char_end,
    fused.similarity,
    fused.score
  FROM fused
  JOIN public.knowledge_chunks AS chunk ON chunk.id = fused.id
  ORDER BY fused.score DESC, chunk.source_date DESC, chunk.id
  LIMIT least(greatest(coalesce(p_match_count, 10), 1), 20);
$$;

REVOKE ALL ON FUNCTION public.search_private_knowledge(extensions.vector, TEXT, INTEGER, DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_private_knowledge(extensions.vector, TEXT, INTEGER, DATE, DATE) TO service_role;

INSERT INTO public.knowledge_source_settings (source_id)
SELECT diary.id FROM public."diaryContent" AS diary
ON CONFLICT (source_id) DO NOTHING;

INSERT INTO public.knowledge_index_jobs (source_id)
SELECT diary.id FROM public."diaryContent" AS diary
ON CONFLICT (source_id) DO UPDATE SET
  status = 'pending',
  queued_at = now(),
  started_at = NULL,
  completed_at = NULL,
  last_error = NULL,
  updated_at = now();

COMMIT;
