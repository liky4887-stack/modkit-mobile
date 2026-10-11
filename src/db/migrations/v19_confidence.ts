// v19: confidence scoring for findings.
//
// The manager's shadow verifier scores every finding 0.0–1.0 based on
// how strongly a second tool confirmed it. That score is stored here
// so the FINDINGS UI can show a confidence badge per card.
export const MIGRATION_V19 = `
ALTER TABLE findings ADD COLUMN confidence REAL NOT NULL DEFAULT 0.8;
ALTER TABLE findings ADD COLUMN confidence_band TEXT NOT NULL DEFAULT 'medium';

CREATE INDEX IF NOT EXISTS idx_findings_confidence
  ON findings(job_id, confidence_band);
`;
