-- Migration 007: Split dream diary raw and poetic narratives.

ALTER TABLE dream_diary
  ADD COLUMN IF NOT EXISTS raw_narrative TEXT,
  ADD COLUMN IF NOT EXISTS poetic_narrative TEXT;

UPDATE dream_diary
SET
  raw_narrative = COALESCE(raw_narrative, narrative),
  poetic_narrative = COALESCE(poetic_narrative, narrative)
WHERE narrative IS NOT NULL;
