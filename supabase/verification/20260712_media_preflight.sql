-- Every result set below must be empty before its matching constraint is installed.

-- A diary date may identify only one diary.
SELECT date, count(*) AS row_count, array_agg(id ORDER BY id) AS diary_ids
FROM public."diaryContent"
GROUP BY date
HAVING count(*) > 1;

-- image_paths must already be a non-null JSON array.
SELECT id, date, image_paths
FROM public."diaryContent"
WHERE image_paths IS NULL OR jsonb_typeof(image_paths) <> 'array';

-- Every diary image path must match the strict format, directory year, and full diary date.
WITH diary_paths AS (
  SELECT d.id, d.date, p.path, p.ordinality
  FROM public."diaryContent" AS d
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(d.image_paths) = 'array' THEN d.image_paths ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS p(path, ordinality)
)
SELECT id, date, path, ordinality
FROM diary_paths
WHERE path !~ '^[0-9]{4}/[0-9]{8}_[0-9]+\.webp$'
   OR split_part(path, '/', 1) <> to_char(date, 'YYYY')
   OR substring(split_part(path, '/', 2) FROM 1 FOR 8) <> to_char(date, 'YYYYMMDD');

-- A diary may not repeat a path inside its own JSON array.
WITH diary_paths AS (
  SELECT d.id, p.path
  FROM public."diaryContent" AS d
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(d.image_paths) = 'array' THEN d.image_paths ELSE '[]'::jsonb END
  ) AS p(path)
)
SELECT id, path, count(*) AS occurrences
FROM diary_paths
GROUP BY id, path
HAVING count(*) > 1;

-- A diary image path may belong to only one existing diary.
WITH diary_paths AS (
  SELECT d.id, p.path
  FROM public."diaryContent" AS d
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(d.image_paths) = 'array' THEN d.image_paths ELSE '[]'::jsonb END
  ) AS p(path)
)
SELECT path, count(DISTINCT id) AS diary_count, array_agg(DISTINCT id ORDER BY id) AS diary_ids
FROM diary_paths
GROUP BY path
HAVING count(DISTINCT id) > 1;

-- Yearly image paths must be present, strictly formatted, and unique among existing rows.
SELECT id, yearly_summary_id, storage_path
FROM public.yearly_images
WHERE storage_path IS NULL OR storage_path !~ '^yearly/[1-9][0-9]*\.webp$';

SELECT storage_path, count(*) AS row_count, array_agg(id ORDER BY id) AS image_ids
FROM public.yearly_images
WHERE storage_path IS NOT NULL
GROUP BY storage_path
HAVING count(*) > 1;

-- Audio paths must be root-level MP3 names and unique among existing rows.
SELECT id, audio_path
FROM public.audio_messages
WHERE audio_path IS NULL OR audio_path !~ '^[^/\\?%#]+\.mp3$';

SELECT audio_path, count(*) AS row_count, array_agg(id ORDER BY id) AS audio_ids
FROM public.audio_messages
WHERE audio_path IS NOT NULL
GROUP BY audio_path
HAVING count(*) > 1;
