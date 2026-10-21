import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight, Database, Radio, SearchX, ShieldCheck, TriangleAlert } from 'lucide-react';
import { RefreshButton } from './navigation';

export function PageHeading({ eyebrow, title, description, connected = true }: { eyebrow: string; title: string; description: string; connected?: boolean }) {
  return <header className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="heading-actions"><span className={`connection ${connected ? '' : 'offline'}`}><span />{connected ? 'Workspace connected' : 'Workspace offline'}</span><RefreshButton /></div></header>;
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{children}</span>;
}
export function Offline({ requestId }: { requestId?: string | null }) {
  return <><PageHeading eyebrow="YOUR LOCAL WORKSPACE" title="Opportunity radar" description="Your next move starts with a clearer view." connected={false} /><section className="empty-panel offline-panel" role="alert"><div className="empty-icon"><Database size={30} /></div><h2>Your workspace is taking a breather</h2><p>The stored jobs couldn’t be loaded. Check that PostgreSQL and the backend are running, then refresh this page.</p><div className="command-row"><code>npm run db:start</code><code>npm run backend</code></div><RefreshButton />{requestId && <small>Request reference: {requestId}</small>}</section></>;
}
export function EmptyJobs({ hasStoredJobs }: { hasStoredJobs: boolean }) {
  return <div className="empty-panel"><div className="empty-icon"><SearchX size={30} /></div><h2>{hasStoredJobs ? 'No matches in this part of the radar' : 'A fresh start for your search'}</h2><p>{hasStoredJobs ? 'Try a broader title, another location, or clear your filters to see all stored opportunities.' : 'Collect jobs from an employer, or load the fictional sample to explore the workspace.'}</p><Link href={hasStoredJobs ? '/' : '/guide'} className="button button-green" prefetch={false}>{hasStoredJobs ? 'Clear filters' : 'See how to get started'}<ArrowUpRight size={15} /></Link></div>;
}
export function SignalNote() {
  return <aside className="signal-note"><ShieldCheck size={19} aria-hidden="true" /><div><strong>Evidence over assumptions</strong><p>Remote doesn’t always mean remote from India. Open a posting to see what the source actually says.</p></div><Link href="/guide" aria-label="Learn how geography signals work" prefetch={false}><ArrowUpRight size={17} /></Link></aside>;
}
export function NoSelection() {
  return <aside className="inspector no-selection"><Radio size={30} /><h3>A closer look, when you’re ready</h3><p>Select an opportunity to inspect its description, geography evidence, and posting history.</p></aside>;
}
export function FilterProblem() {
  return <><PageHeading eyebrow="YOUR LOCAL WORKSPACE" title="Opportunity radar" description="Your next move starts with a clearer view." connected={false} /><div className="empty-panel"><TriangleAlert size={32} /><h2>These filters couldn’t be read</h2><p>Use the search controls to choose a valid title, location, workplace or source.</p><Link href="/" className="button button-green">Reset filters</Link></div></>;
}
