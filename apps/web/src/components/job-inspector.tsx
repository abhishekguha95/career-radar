'use client';

import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ArrowUpRight, Check, Clock3, FileText, History, Link2, MapPin, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { JobDetail } from '@career-radar/contracts';
import { employmentLabel, formatDate, geography, observedAgo, sourceLabel, workplaceLabel } from '../lib/presentation';
import { Badge } from './shared';

const tabs = ['Overview', 'Evidence', 'History'] as const;
const explanations: Record<string, string> = {
  EXPLICIT_INDIA_REMOTE_PERMISSION: 'The source explicitly permits working remotely from India.',
  EXPLICIT_RESIDENCE_EXCLUSION: 'The source states a current-residence restriction that conflicts with working from India.',
  NO_EXPLICIT_INDIA_REMOTE_EVIDENCE: 'The source does not establish whether the role can be performed remotely from India.',
  CONFLICTING_GEOGRAPHY_EVIDENCE: 'The posting contains conflicting permission and residence requirements.',
  CONTEXT_REQUIRES_REVIEW: 'Qualifying language means the statement needs a closer review.',
  CONFLICTING_WORKPLACE_METADATA: 'The description and structured workplace setting disagree.',
};

export function JobInspector({ job, now, explicit }: { job: JobDetail; now: string; explicit: boolean }) {
  const [active, setActive] = useState<(typeof tabs)[number]>('Overview');
  const [rawOpen, setRawOpen] = useState(false);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const signal = geography(job);
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
    setActive(tabs[next]!);
    buttons.current[next]?.focus();
  };
  return <aside className="inspector" id="job-details" data-explicit={explicit} aria-label="Posting details">
    <div className="inspector-top"><span className="section-label">THE CLOSER LOOK</span><Badge>{sourceLabel(job.source)}</Badge></div>
    <div className="inspector-heading"><div className="company-avatar large">{job.employer.slice(0, 1).toUpperCase()}</div><span>{job.employer}</span><h2>{job.title}</h2><p><MapPin size={14} aria-hidden="true" />{job.location ?? 'Location not provided'}</p></div>
    <div className="inspector-facts"><span>{workplaceLabel(job.workplace)}</span><span>{employmentLabel(job.employmentType)}</span></div>
    <a className="button button-green original-link" href={job.canonicalUrl} target="_blank" rel="noopener noreferrer">View original posting<ArrowUpRight size={17} /></a>
    <div className="inspector-tabs" role="tablist" aria-label="Posting information">{tabs.map((tab, index) => <button key={tab} ref={(element) => { buttons.current[index] = element; }} role="tab" id={`tab-${tab}`} aria-controls={`panel-${tab}`} aria-selected={active === tab} tabIndex={active === tab ? 0 : -1} onKeyDown={(event) => keyDown(event, index)} onClick={() => setActive(tab)}>{tab === 'Overview' ? <FileText size={14} /> : tab === 'Evidence' ? <ShieldCheck size={14} /> : <History size={14} />}{tab}{tab === 'History' && <span>{job.provenance.history.total}</span>}</button>)}</div>
    <section className="inspector-content" role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} tabIndex={0}>
      {active === 'Overview' && <><div className={`signal-summary signal-${signal.tone}`}><ShieldCheck size={20} /><div><strong>{signal.label}</strong><p>India-remote geography signal</p></div></div><h3>About this role</h3><div className="job-description">{job.description ?? 'The source did not provide a description.'}</div><dl className="detail-dates"><div><dt>First observed</dt><dd>{formatDate(job.firstSeenAt)}</dd></div><div><dt>Last observed</dt><dd title={job.lastSeenAt}>{observedAgo(job.lastSeenAt, now)}</dd></div><div><dt>Posted by employer</dt><dd>{formatDate(job.postedAt)}</dd></div></dl><p className="small-note">Observation dates describe when Career Radar saw this posting. They do not establish when the employer first published it.</p></>}
      {active === 'Evidence' && <><div className={`signal-summary signal-${signal.tone}`}><TriangleAlert size={20} /><div><strong>{signal.label}</strong><p>India-remote geography signal</p></div></div><h3>Why this signal?</h3>{job.eligibility ? job.eligibility.reasonCodes.map((reason) => <p className="reason" key={reason}>{explanations[reason] ?? reason.replaceAll('_', ' ').toLowerCase()}</p>) : <p>This posting has not been assessed yet.</p>}{job.eligibility?.evidence.map((evidence, index) => <blockquote key={`${evidence.field}-${index}`}><p>“{evidence.text}”</p><footer>{evidence.field === 'description' ? 'Posting description' : 'Posted location'} · observed {formatDate(evidence.observedAt)}</footer></blockquote>)}<p className="small-note">{job.eligibility?.disclaimer ?? 'Work authorization, sponsorship and overall application eligibility require verification.'}</p><div className="provenance-box"><strong><Link2 size={14} />Source record</strong><dl><div><dt>Provider</dt><dd>{job.source.provider} · {job.source.region}</dd></div><div><dt>Posting ID</dt><dd>{job.externalId}</dd></div><div><dt>Rule version</dt><dd>{job.eligibility?.classifierVersion ?? 'Not assessed'}</dd></div><div><dt>Mapping</dt><dd>{job.provenance.currentSnapshot.mappingVersion}</dd></div></dl><button className="text-button" onClick={() => setRawOpen(!rawOpen)} aria-expanded={rawOpen}>{rawOpen ? 'Hide' : 'View'} original source payload</button>{rawOpen && <pre className="raw-payload">{JSON.stringify(job.provenance.currentSnapshot.raw, null, 2)}</pre>}</div></>}
      {active === 'History' && <><h3>How this posting changed</h3><p className="small-note">A version is preserved when source content changes. Unchanged observations refresh the date without adding a version.</p><ol className="history-list">{job.provenance.history.data.map((version) => <li key={version.id}><span className="history-marker"><Check size={12} /></span><div><strong>Version {version.revision}{version.revision === job.provenance.currentSnapshot.revision && <span className="current-label">Current</span>}</strong><p>{version.title}</p><time dateTime={version.observedAt}>{formatDate(version.observedAt)}</time><small>{version.mappingVersion}</small></div></li>)}</ol>{job.provenance.history.hasMore && <p className="small-note">Showing the most recent 20 versions. Older history remains stored.</p>}<div className="observation-footnote"><Clock3 size={15} />Latest observation: {formatDate(job.provenance.latestObservation.observedAt)}</div></>}
    </section>
  </aside>;
}
