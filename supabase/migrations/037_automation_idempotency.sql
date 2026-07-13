-- ============================================================
-- 037_automation_idempotency.sql
-- Add trigger_context to automation_logs to enable webhook retry idempotency.
-- ============================================================

ALTER TABLE automation_logs ADD COLUMN IF NOT EXISTS trigger_context JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Index for fast idempotency lookups on webhook retry
CREATE INDEX IF NOT EXISTS idx_automation_logs_meta_msg
  ON automation_logs((trigger_context->>'meta_message_id'))
  WHERE (trigger_context->>'meta_message_id') IS NOT NULL;
