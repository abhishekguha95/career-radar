import { createHash, randomUUID } from 'node:crypto';
import { sourceConfigSchema } from '@career-radar/contracts';
import type { EligibilitySignal, IngestionError, NormalizedRecord, RunCounters, RunStatus, SourceConfig } from '@career-radar/contracts';
import type { Pool, PoolClient } from 'pg';

export class PersistenceError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'PersistenceError'; }
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

function contentHash(record: NormalizedRecord): string {
  return createHash('sha256').update(JSON.stringify(stable({ raw: record.raw, normalized: record.job, mappingVersion: record.provenance.mappingVersion }))).digest('hex');
}

export const emptyCounters = (): RunCounters => ({ fetched: 0, accepted: 0, created: 0, updated: 0, unchanged: 0, rejected: 0 });

export class JobRepository {
  constructor(readonly pool: Pool) {}

  async upsertSource(source: SourceConfig, mode: 'FIXTURE' | 'LIVE'): Promise<string> {
    const config = sourceConfigSchema.parse(source);
    const result = await this.pool.query<{ id: string }>(`
      INSERT INTO job_sources (provider, region, site, mode, employer, configuration, policy)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (provider, region, site, mode) DO UPDATE
        SET employer=EXCLUDED.employer, configuration=EXCLUDED.configuration
      RETURNING id`, [config.provider, config.region, config.site, mode, config.employer, config, {
      documentationUrl: config.provider === 'GREENHOUSE' ? 'https://docs.greenhouse.io/job-board.html' : 'https://github.com/lever/postings-api',
      reviewedAt: config.provider === 'GREENHOUSE' ? '2026-10-22' : '2026-10-21',
      requestIntervalMs: 250, maxAttempts: 3, timeoutMs: 10_000, maxResponseBytes: 8 * 1024 * 1024,
      closurePolicy: 'NO_AUTOMATIC_CLOSURE',
    }]);
    return result.rows[0]!.id;
  }

  async acquireSource(sourceId: string): Promise<() => Promise<void>> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired', [`source:${sourceId}`]);
      if (!result.rows[0]?.acquired) throw new PersistenceError('SOURCE_BUSY', 'Another ingestion run holds this source');
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        let releaseError: Error | undefined;
        try { await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [`source:${sourceId}`]); }
        catch { releaseError = new Error('Source lock connection lost'); }
        finally { client.release(releaseError); }
      };
    } catch (error) { client.release(); throw error; }
  }

  async startRun(sourceId: string): Promise<string> {
    // Caller must hold the source lock. A leftover RUNNING run cannot still own it.
    await this.pool.query(`UPDATE ingestion_runs SET status='ABORTED', finished_at=now(),
      errors=errors || '[{"code":"INTERRUPTED","message":"Previous run ended without finalization","page":null,"recordIndex":null,"externalId":null}]'::jsonb
      WHERE source_id=$1 AND status='RUNNING'`, [sourceId]);
    const result = await this.pool.query<{ id: string }>('INSERT INTO ingestion_runs (source_id) VALUES ($1) RETURNING id', [sourceId]);
    return result.rows[0]!.id;
  }

  async finishRun(runId: string, status: Exclude<RunStatus, 'RUNNING'>, complete: boolean, counters: RunCounters, errors: IngestionError[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ source_id: string }>(`UPDATE ingestion_runs
        SET finished_at=now(), status=$2, complete=$3, counters=$4, errors=$5
        WHERE id=$1 AND status='RUNNING' RETURNING source_id`, [runId, status, complete, counters, JSON.stringify(errors.slice(0, 50))]);
      const sourceId = result.rows[0]?.source_id;
      if (!sourceId) throw new PersistenceError('RUN_NOT_ACTIVE', 'Run is not active');
      await client.query(`UPDATE job_sources SET health=$2,
        last_success_at=CASE WHEN $3 THEN now() ELSE last_success_at END WHERE id=$1`,
      [sourceId, status === 'SUCCEEDED' ? 'HEALTHY' : status === 'PARTIAL' ? 'DEGRADED' : 'UNAVAILABLE', status === 'SUCCEEDED']);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async persist(sourceId: string, runId: string, record: NormalizedRecord, assessment?: EligibilitySignal): Promise<'created' | 'updated' | 'unchanged'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Exact posting lock also protects direct/concurrent callers from orphan opportunities.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`posting:${sourceId}:${record.job.externalId}`]);
      const run = await client.query<{ mode: string }>(`SELECT s.mode FROM ingestion_runs r JOIN job_sources s ON s.id=r.source_id
        WHERE r.id=$1 AND r.source_id=$2 AND r.status='RUNNING'`, [runId, sourceId]);
      if (run.rows[0]?.mode !== record.provenance.mode) throw new PersistenceError('RUN_SOURCE_MISMATCH', 'Posting does not belong to the active source run');
      const previous = await client.query<{ id: string; content_hash: string; current_snapshot_id: string; last_seen_at: Date; revision: number }>(`
        SELECT p.id,p.content_hash,p.current_snapshot_id,p.last_seen_at,s.revision
        FROM job_postings p JOIN job_snapshots s ON s.id=p.current_snapshot_id
        WHERE p.source_id=$1 AND p.external_id=$2 FOR UPDATE OF p`, [sourceId, record.job.externalId]);
      const existing = previous.rows[0];
      const hash = contentHash(record);
      const observedAt = record.provenance.observedAt;
      const changed = existing?.content_hash !== hash;
      if (existing && changed && new Date(observedAt).getTime() < existing.last_seen_at.getTime()) {
        throw new PersistenceError('STALE_OBSERVATION', 'Older source content cannot replace a newer observation');
      }
      let snapshotId = existing?.current_snapshot_id ?? randomUUID();
      const postingId = existing?.id ?? randomUUID();
      if (!existing) {
        const opportunity = await client.query<{ id: string }>('INSERT INTO opportunities DEFAULT VALUES RETURNING id');
        await client.query(`INSERT INTO job_postings
          (id,source_id,opportunity_id,external_id,title,employer,location,workplace,normalized,first_seen_at,last_seen_at,content_hash,current_snapshot_id,last_run_id,last_provenance)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13,$14)`,
        [postingId, sourceId, opportunity.rows[0]!.id, record.job.externalId, record.job.title, record.job.employer, record.job.location, record.job.workplace, record.job, observedAt, hash, snapshotId, runId, record.provenance]);
      } else {
        if (changed) snapshotId = randomUUID();
        await client.query(`UPDATE job_postings SET title=$2,employer=$3,location=$4,workplace=$5,normalized=$6,
          first_seen_at=LEAST(first_seen_at,$7),last_seen_at=GREATEST(last_seen_at,$7),content_hash=$8,current_snapshot_id=$9,
          last_run_id=CASE WHEN $7 >= last_seen_at THEN $10 ELSE last_run_id END,
          last_provenance=CASE WHEN $7 >= last_seen_at THEN $11 ELSE last_provenance END
          WHERE id=$1`, [postingId, record.job.title, record.job.employer, record.job.location, record.job.workplace, record.job, observedAt, hash, snapshotId, runId, record.provenance]);
      }
      if (changed) {
        await client.query(`INSERT INTO job_snapshots
          (id,posting_id,run_id,revision,content_hash,raw,normalized,provenance,mapping_version,observed_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [snapshotId, postingId, runId, (existing?.revision ?? 0) + 1, hash, record.raw, record.job, record.provenance, record.provenance.mappingVersion, observedAt]);
      }
      if (assessment) await this.saveAssessment(client, snapshotId, assessment, observedAt);
      await client.query('COMMIT');
      return existing ? changed ? 'updated' : 'unchanged' : 'created';
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  private async saveAssessment(client: PoolClient, snapshotId: string, assessment: EligibilitySignal, observedAt: string): Promise<void> {
    await client.query(`INSERT INTO eligibility_assessments
      (snapshot_id,context,result,reason_codes,evidence,classifier_version,disclaimer,checked_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (snapshot_id,context,classifier_version) DO NOTHING`,
    [snapshotId, assessment.context, assessment.result, JSON.stringify(assessment.reasonCodes), JSON.stringify(assessment.evidence), assessment.classifierVersion, assessment.disclaimer, observedAt]);
  }
}
