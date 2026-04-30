-- Migration 004: enforce one active memory row per node
--
-- updateNodeByPath first marks the old row as deprecated, then inserts the new
-- active row. This index makes that application invariant explicit in every
-- environment and matches the production constraint name. The duplicate cleanup
-- intentionally avoids migrated_to because deployed databases may have it as
-- integer while old local schemas declared it as text.

WITH ranked AS (
  SELECT
    id,
    node_uuid,
    FIRST_VALUE(id) OVER (PARTITION BY node_uuid ORDER BY created_at DESC, id DESC) AS latest_id,
    ROW_NUMBER() OVER (PARTITION BY node_uuid ORDER BY created_at DESC, id DESC) AS rn
  FROM memories
  WHERE deprecated = FALSE
)
UPDATE memories m
SET deprecated = TRUE
FROM ranked
WHERE m.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_memory
  ON memories (node_uuid)
  WHERE deprecated = FALSE;
