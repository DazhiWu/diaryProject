-- Cover the two Phase 3A foreign-key lookup directions reported by the database advisor.
BEGIN;

CREATE INDEX understanding_summaries_supersedes_summary_id_idx
  ON public.understanding_summaries (supersedes_summary_id);

CREATE INDEX understanding_summary_observations_observation_id_idx
  ON public.understanding_summary_observations (observation_id);

COMMIT;
