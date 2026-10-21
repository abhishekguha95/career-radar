'use client';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="empty-panel" role="alert"><h1>Something interrupted this view</h1><p>Your stored postings haven’t changed. Try loading the page again.</p><button className="button button-green" onClick={() => reset()}>Try again</button></section>;
}
