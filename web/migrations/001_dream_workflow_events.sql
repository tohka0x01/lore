CREATE TABLE IF NOT EXISTS dream_workflow_events (
  id         BIGSERIAL PRIMARY KEY,
  diary_id   BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dream_workflow_events_diary_idx
  ON dream_workflow_events(diary_id, id ASC);

CREATE INDEX IF NOT EXISTS dream_workflow_events_created_idx
  ON dream_workflow_events(created_at DESC);
