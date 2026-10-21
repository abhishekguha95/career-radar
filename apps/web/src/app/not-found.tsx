import Link from 'next/link';

export default function NotFound() {
  return <section className="empty-panel"><h1>This page is off the radar</h1><p>Head back to your stored opportunities.</p><Link className="button button-green" href="/">Back to opportunities</Link></section>;
}
