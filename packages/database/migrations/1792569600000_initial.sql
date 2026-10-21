-- Up Migration
CREATE TABLE job_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider = 'LEVER'),
  region text NOT NULL CHECK (region IN ('global', 'eu')),
  site text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('FIXTURE', 'LIVE')),
  employer text NOT NULL,
  configuration jsonb NOT NULL,
  policy jsonb NOT NULL,
  health text NOT NULL DEFAULT 'UNKNOWN' CHECK (health IN ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNAVAILABLE')),
  last_success_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, region, site, mode)
);

CREATE TABLE ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES job_sources(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'ABORTED')),
  complete boolean NOT NULL DEFAULT false,
  counters jsonb NOT NULL DEFAULT '{"fetched":0,"accepted":0,"created":0,"updated":0,"unchanged":0,"rejected":0}',
  errors jsonb NOT NULL DEFAULT '[]',
  CHECK ((status = 'RUNNING') = (finished_at IS NULL))
);
CREATE INDEX ingestion_runs_source_started_idx ON ingestion_runs (source_id, started_at DESC);

CREATE TABLE opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES job_sources(id),
  opportunity_id uuid NOT NULL REFERENCES opportunities(id),
  external_id text NOT NULL,
  title text NOT NULL,
  employer text NOT NULL,
  location text,
  workplace text NOT NULL CHECK (workplace IN ('REMOTE', 'HYBRID', 'ON_SITE', 'UNKNOWN')),
  normalized jsonb NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  external_status text NOT NULL DEFAULT 'PUBLISHED' CHECK (external_status IN ('PUBLISHED', 'UNKNOWN', 'CLOSED')),
  content_hash text NOT NULL,
  current_snapshot_id uuid NOT NULL,
  last_run_id uuid NOT NULL REFERENCES ingestion_runs(id),
  UNIQUE (source_id, external_id),
  CHECK (first_seen_at <= last_seen_at)
);
CREATE INDEX job_postings_observed_idx ON job_postings (last_seen_at DESC, id DESC);
CREATE INDEX job_postings_source_idx ON job_postings (source_id);

CREATE TABLE job_snapshots (
  id uuid PRIMARY KEY,
  posting_id uuid NOT NULL REFERENCES job_postings(id),
  run_id uuid NOT NULL REFERENCES ingestion_runs(id),
  revision integer NOT NULL CHECK (revision > 0),
  content_hash text NOT NULL,
  raw jsonb NOT NULL,
  normalized jsonb NOT NULL,
  provenance jsonb NOT NULL,
  mapping_version text NOT NULL,
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (posting_id, revision),
  UNIQUE (posting_id, id)
);
ALTER TABLE job_postings ADD CONSTRAINT job_postings_current_snapshot_fk
  FOREIGN KEY (id, current_snapshot_id) REFERENCES job_snapshots(posting_id, id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE eligibility_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES job_snapshots(id),
  context text NOT NULL CHECK (context = 'INDIA_REMOTE'),
  result text NOT NULL CHECK (result IN ('ELIGIBLE', 'INELIGIBLE', 'UNKNOWN')),
  reason_codes jsonb NOT NULL,
  evidence jsonb NOT NULL,
  classifier_version text NOT NULL,
  disclaimer text NOT NULL,
  checked_at timestamptz NOT NULL,
  UNIQUE (snapshot_id, context, classifier_version)
);

-- Down Migration
ALTER TABLE job_postings DROP CONSTRAINT job_postings_current_snapshot_fk;
DROP TABLE eligibility_assessments;
DROP TABLE job_snapshots;
DROP TABLE job_postings;
DROP TABLE opportunities;
DROP TABLE ingestion_runs;
DROP TABLE job_sources;
