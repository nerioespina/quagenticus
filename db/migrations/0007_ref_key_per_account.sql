-- ref_key was globally unique: two accounts with a "DEMO" space collided on DEMO-1.
DROP INDEX IF EXISTS idx_document_ref_key;
CREATE UNIQUE INDEX idx_document_ref_key ON document(account_id, ref_key) WHERE ref_key IS NOT NULL;
