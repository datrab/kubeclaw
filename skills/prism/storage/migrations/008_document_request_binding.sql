ALTER TABLE prism.design_document
  ADD COLUMN IF NOT EXISTS design_request_id uuid REFERENCES prism.design_request(id);
CREATE INDEX IF NOT EXISTS design_document_request_idx
  ON prism.design_document(design_request_id);
