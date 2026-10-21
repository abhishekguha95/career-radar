'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BriefcaseBusiness, Building2, CircleHelp, RefreshCw } from 'lucide-react';
import { useTransition } from 'react';

export function Navigation() {
  const path = usePathname();
  return <nav aria-label="Main navigation">
    {[{ href: '/', label: 'Opportunities', icon: BriefcaseBusiness }, { href: '/sources', label: 'Sources', icon: Building2 }, { href: '/guide', label: 'How it works', icon: CircleHelp }].map(({ href, label, icon: Icon }) => <Link key={href} href={href} prefetch={false} className={`nav-link ${path === href ? 'active' : ''}`} aria-current={path === href ? 'page' : undefined}><Icon size={18} aria-hidden="true" />{label}{path === href && <span className="nav-dot" />}</Link>)}
  </nav>;
}

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button className="button button-white" onClick={() => startTransition(() => router.refresh())} disabled={pending} title="Reload stored data; this does not start a crawl"><RefreshCw size={15} className={pending ? 'spinning' : ''} aria-hidden="true" />{pending ? 'Refreshing…' : 'Refresh list'}</button>;
}
