-- Up Migration
ALTER TABLE job_postings ADD COLUMN last_provenance jsonb;
UPDATE job_postings p SET last_provenance=s.provenance
  FROM job_snapshots s WHERE s.id=p.current_snapshot_id;
ALTER TABLE job_postings ALTER COLUMN last_provenance SET NOT NULL;

-- Down Migration
ALTER TABLE job_postings DROP COLUMN last_provenance;
