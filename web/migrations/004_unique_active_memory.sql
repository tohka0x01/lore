-- Migration 004: enforce one active memory row per node
--
-- updateNodeByPath first marks the old row as deprecated, then inserts the new
-- active row. This index makes that application invariant explicit in every
-- environment and matches the production constraint name.

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
SET deprecated = TRUE,
    migrated_to = ranked.latest_id::text
FROM ranked
WHERE m.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_memory
  ON memories (node_uuid)
  WHERE deprecated = FALSE;
