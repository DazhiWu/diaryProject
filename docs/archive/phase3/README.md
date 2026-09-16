# Archived Phase 3 Understanding Route

This directory preserves the abandoned theme-timeline, observation-review, period-comparison, and digital-twin design material. It is historical reference only and is not an active product plan.

The application no longer exposes `/api/knowledge/understanding`, does not mount the theme-timeline interface, and does not call Ollama. The active product is the [private diary recall assistant](../../PRIVATE_RECALL_ASSISTANT.md), which uses the existing private knowledge index and cited on-demand answers.

## Database boundary

- Production migrations through Phase 3C were previously applied. Their `understanding_*` tables and historical rows remain in production as dormant derived data.
- Applied migration, rollback, and verification files remain under `supabase/` so database history stays reproducible.
- Phase 3D and semantic-quality v4 were never applied. Their migration, rollback, and postflight SQL files are stored under [`sql-unapplied`](sql-unapplied/) and must not be passed to the active Supabase migration runner.
- No cleanup migration has been created. Removing the dormant production schema requires a separately reviewed backup and drop migration.

## Archived documents

- [`PHASE3_UNDERSTANDING_PLAN.md`](PHASE3_UNDERSTANDING_PLAN.md)
- [`THEME_TIMELINE_THEME_CATALOG.md`](THEME_TIMELINE_THEME_CATALOG.md)
- [`DIGITAL_TWIN_ROADMAP.md`](DIGITAL_TWIN_ROADMAP.md)

