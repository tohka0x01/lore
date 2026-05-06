-- Migration 008: Store recall query runtime on query rollups.

ALTER TABLE recall_queries
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0);
