import Link from 'next/link';
import { ArrowUpRight, BriefcaseBusiness, Building2, ChevronLeft, ChevronRight, Clock3, Globe2, MapPin, Radio, X } from 'lucide-react';
import { ApiReadError, readJob, readJobs, readSources } from '../lib/api.server';
import { employmentLabel, geography, jobsHref, observedAgo, parseFilters, sourceLabel, workplaceLabel } from '../lib/presentation';
import type { PageParams } from '../lib/presentation';
import { Badge, EmptyJobs, FilterProblem, NoSelection, Offline, PageHeading, SignalNote } from '../components/shared';
import { SearchFilters } from '../components/filters';
import { JobInspector } from '../components/job-inspector';

export const dynamic = 'force-dynamic';

export default async function Opportunities({ searchParams }: { searchParams: Promise<PageParams> }) {
  const now = new Date().toISOString();
  let parsed: ReturnType<typeof parseFilters>;
  try { parsed = parseFilters(await searchParams, new Date(now)); } catch { return <FilterProblem />; }
  const { query, filters, selectedId } = parsed;
  try {
    const [result, sources] = await Promise.all([readJobs(query), readSources()]);
    const selected = selectedId || result.data[0]?.id;
    let detail = null;
    let detailUnavailable = false;
    if (selected) {
      try { detail = (await readJob(selected)).data; }
      catch { detailUnavailable = true; }
    }
    const totalStored = sources.data.reduce((sum, source) => sum + source.jobCount, 0);
    const remoteStored = sources.data.reduce((sum, source) => sum + source.remoteCount, 0);
    const sourceFilter = sources.data.find((source) => source.id === filters.source);
    return <>
      <PageHeading eyebrow="YOUR SEARCH, IN FOCUS" title="Opportunity radar" description="Explore your next move, with the source in view." />
      <section className="metrics" aria-label="Workspace totals"><div className="metric-card"><div><span>Stored postings</span><strong>{totalStored.toLocaleString('en')}</strong><small>Across your local workspace</small></div><span className="metric-icon"><BriefcaseBusiness size={21} /></span></div><div className="metric-card"><div><span>Tracked sources</span><strong>{sources.data.length.toLocaleString('en')}</strong><small>Employer feeds and sample sources</small></div><span className="metric-icon"><Building2 size={21} /></span></div><div className="metric-card"><div><span>Listed as remote</span><strong>{remoteStored.toLocaleString('en')}</strong><small>Hiring geography still needs evidence</small></div><span className="metric-icon"><Globe2 size={21} /></span></div></section>
      <SignalNote />
      <SearchFilters filters={filters} />
      {sourceFilter && <div className="source-filter-chip">Source: <strong>{sourceFilter.employer}</strong><Link href={jobsHref(filters, { source: '', page: 1 })} aria-label="Remove source filter" prefetch={false}><X size={14} /></Link></div>}
      <div className="results-layout"><section className="results-column" aria-label="Opportunities"><div className="results-heading"><div><h2>{result.pagination.total.toLocaleString('en')} {result.pagination.total === 1 ? 'opportunity' : 'opportunities'}</h2><span>Most recently observed first</span></div><span className="results-view"><Radio size={14} />Live view of stored data</span></div>
        {result.data.length ? <div className="job-list">{result.data.map((job) => {
          const signal = geography(job);
          return <Link key={job.id} prefetch={false} href={`${jobsHref(filters, { job: job.id })}#job-details`} className={`job-card ${detail?.id === job.id ? 'selected' : ''}`} aria-label={`View ${job.title} at ${job.employer}`} aria-current={detail?.id === job.id ? 'true' : undefined}><div className="job-card-top"><div className="company-avatar">{job.employer.slice(0, 1).toUpperCase()}</div><div className="job-company"><strong>{job.employer}</strong><span>{job.source.provider.toLowerCase()} · {sourceLabel(job.source)}</span></div><ArrowUpRight size={17} className="card-arrow" /></div><h3>{job.title}</h3><div className="job-meta"><span><MapPin size={13} />{job.location ?? 'Location not provided'}</span><span>{workplaceLabel(job.workplace)}</span><span>{employmentLabel(job.employmentType)}</span></div><div className="job-card-bottom"><Badge tone={signal.tone}>{signal.label}</Badge><span title={job.lastSeenAt}><Clock3 size={12} />Observed {observedAgo(job.lastSeenAt, now)}</span></div></Link>;
        })}</div> : <EmptyJobs hasStoredJobs={totalStored > 0} />}
        <div className="pagination" aria-label="Pagination"><span>{result.pagination.total ? `Page ${filters.page} of ${result.pagination.totalPages}` : 'No results'} · {result.pagination.total} total</span><div>{filters.page > 1 ? <Link href={jobsHref(filters, { page: filters.page - 1 })} aria-label="Previous page" className="page-button" prefetch={false}><ChevronLeft size={16} /></Link> : <button className="page-button" aria-label="Previous page" disabled><ChevronLeft size={16} /></button>}{result.pagination.hasNext ? <Link href={jobsHref(filters, { page: filters.page + 1 })} aria-label="Next page" className="page-button" prefetch={false}><ChevronRight size={16} /></Link> : <button className="page-button" aria-label="Next page" disabled><ChevronRight size={16} /></button>}</div></div>
      </section>{detail ? <JobInspector key={detail.id} job={detail} now={now} explicit={Boolean(selectedId)} /> : detailUnavailable ? <aside className="inspector empty-panel" id="job-details" role="alert"><h3>This posting couldn’t be loaded</h3><p>It may no longer be available in this workspace. Choose another posting or refresh the list.</p></aside> : <NoSelection />}</div>
      <footer className="page-footer"><span><span className="status-dot" />Data refreshed for this view</span><Link href="/sources" prefetch={false}>Review source health<ArrowUpRight size={13} /></Link></footer>
    </>;
  } catch (error) { return <Offline requestId={error instanceof ApiReadError ? error.requestId : null} />; }
}
