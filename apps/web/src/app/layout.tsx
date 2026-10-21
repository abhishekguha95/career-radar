import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, LockKeyhole, Radar } from 'lucide-react';
import { Navigation } from '../components/navigation';
import './globals.css';

export const metadata: Metadata = { title: 'Career Radar — A clearer next move', description: 'A local-first workspace for exploring engineering jobs with source evidence and posting history.', robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><a href="#main-content" className="skip-link">Skip to content</a><aside className="sidebar"><Link href="/" className="brand" aria-label="Career Radar home" prefetch={false}><span className="brand-mark"><Radar size={25} /></span><span>Career<span className="brand-light">Radar</span></span></Link><div className="sidebar-caption">WORKSPACE</div><Navigation /><div className="sidebar-bottom"><div className="privacy-card"><LockKeyhole size={18} /><strong>Your search. Your space.</strong><p>Job data stays in your local workspace.</p></div><div className="workspace-label"><span className="workspace-icon">CR</span><div><strong>Local workspace</strong><small>Private by default</small></div><span className="status-dot" /></div></div></aside><div className="app-main"><div className="topbar"><span>Workspace<ChevronRight size={13} /><strong>Career Radar</strong></span><span className="topbar-note"><LockKeyhole size={13} />Local first</span></div><main id="main-content" className="page-content">{children}</main></div></body></html>;
}
