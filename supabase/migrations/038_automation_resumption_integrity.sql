-- ============================================================
-- 038_automation_resumption_integrity.sql
-- Add next_step_id to pending executions to prevent index shifting.
-- ============================================================

ALTER TABLE automation_pending_executions 
  ADD COLUMN IF NOT EXISTS next_step_id UUID REFERENCES automation_steps(id) ON DELETE SET NULL;

-- Relax NOT NULL constraint on next_step_position since we are migrating away from it
ALTER TABLE automation_pending_executions ALTER COLUMN next_step_position DROP NOT NULL;
