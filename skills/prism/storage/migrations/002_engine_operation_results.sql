ALTER TABLE prism.engine_operation ADD COLUMN IF NOT EXISTS request_digest text;
ALTER TABLE prism.engine_operation ADD COLUMN IF NOT EXISTS result jsonb;
