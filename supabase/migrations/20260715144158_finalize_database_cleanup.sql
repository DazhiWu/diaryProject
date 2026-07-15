-- Final database cleanup after the backend authorization rollout.
BEGIN;

-- diary_id already has an ON DELETE CASCADE foreign key to diaryContent(id).
-- This index covers the referencing side for deletes and joins.
CREATE INDEX IF NOT EXISTS diary_image_paths_diary_id_idx
  ON public.diary_image_paths (diary_id);

-- diaryInfo is a preserved legacy keepsake. It is not browser-direct data:
-- any future viewer/admin page must read it through an authorized service-role API.
REVOKE ALL PRIVILEGES ON TABLE public."diaryInfo" FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public."diaryInfo_id_seq" FROM PUBLIC, anon, authenticated;

-- The media invariant rollout and its postflights are complete.
DROP TABLE IF EXISTS private.diary_image_paths_backup_20260713;

COMMIT;
