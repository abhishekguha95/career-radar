-- Up Migration
ALTER TABLE job_sources DROP CONSTRAINT job_sources_provider_check;
ALTER TABLE job_sources ADD CONSTRAINT job_sources_provider_check CHECK (provider IN ('LEVER', 'GREENHOUSE'));
ALTER TABLE job_sources ADD CONSTRAINT job_sources_provider_region_check CHECK (provider <> 'GREENHOUSE' OR region = 'global');

-- Down Migration
-- This fails rather than deleting Greenhouse sources when data exists.
ALTER TABLE job_sources DROP CONSTRAINT job_sources_provider_region_check;
ALTER TABLE job_sources DROP CONSTRAINT job_sources_provider_check;
ALTER TABLE job_sources ADD CONSTRAINT job_sources_provider_check CHECK (provider = 'LEVER');
