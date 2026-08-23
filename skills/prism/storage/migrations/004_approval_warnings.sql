ALTER TABLE prism.approval
  ADD COLUMN IF NOT EXISTS accepted_warning_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
