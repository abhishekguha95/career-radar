import Link from 'next/link';
import { ArrowUpRight, Building2, Clock3, Globe2 } from 'lucide-react';
import { ApiReadError, readSources } from '../../lib/api.server';
import { formatDate, sourceHealth, sourceLabel } from '../../lib/presentation';
import { Badge, Offline, PageHeading } from '../../components/shared';

export const dynamic = 'force-dynamic';

export default async function Sources() {
  try {
    const { data } = await readSources();
    return <><PageHeading eyebrow="WHERE YOUR OPPORTUNITIES BEGIN" title="Your sources" description="A clear view of collection health, coverage, and freshness." /><aside className="plain-note"><Globe2 size={18} /><p>Source health describes the latest collection attempt. A partial collection can still contain useful postings; it does not establish that missing jobs are closed.</p></aside><section className="source-grid" aria-label="Configured sources">{data.length ? data.map((source) => {
      const health = sourceHealth(source);
      return <article className="source-card" key={source.id}><div className="source-card-top"><span className="company-avatar"><Building2 size={22} /></span><Badge tone={health.tone}>{health.label}</Badge></div><h2>{source.employer}</h2><p className="source-provider">{source.provider.toLowerCase()} · {source.region} <span> / </span>{sourceLabel(source)}</p><div className="source-stats"><div><strong>{source.jobCount}</strong><span>Stored postings</span></div><div><strong>{source.remoteCount}</strong><span>Listed as remote</span></div></div><dl className="source-run"><div><dt>Latest run</dt><dd>{source.latestRun?.status.toLowerCase().replaceAll('_', ' ') ?? 'Not run yet'}</dd></div><div><dt>Enumeration</dt><dd>{source.latestRun ? source.latestRun.complete ? 'Complete' : 'Incomplete' : 'Not available'}</dd></div><div><dt><Clock3 size={12} />Last successful run</dt><dd>{formatDate(source.lastSuccessfulRunAt)}</dd></div></dl><Link className="source-link" href={`/?source=${source.id}`} prefetch={false}>Browse postings<ArrowUpRight size={15} /></Link></article>;
    }) : <div className="empty-panel"><Building2 size={32} /><h2>No sources configured yet</h2><p>Collect your first employer feed or load the sample data.</p><Link className="button button-green" href="/guide">Get started</Link></div>}</section></>;
  } catch (error) { return <Offline requestId={error instanceof ApiReadError ? error.requestId : null} />; }
}
