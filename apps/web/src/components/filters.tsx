'use client';

import { Search, SlidersHorizontal } from 'lucide-react';
import type { Filters } from '../lib/presentation';

export function SearchFilters({ filters }: { filters: Filters }) {
  return <form className="filters" action="/" method="get" aria-label="Filter opportunities" key={JSON.stringify(filters)}>
    <div className="search-fields"><label className="input-shell"><Search size={17} aria-hidden="true" /><input name="title" aria-label="Job title" placeholder="Search job titles…" defaultValue={filters.title} maxLength={200} /></label><label className="input-shell location-input"><span className="field-caption">Location</span><input name="location" aria-label="Location keyword" placeholder="Anywhere" defaultValue={filters.location} maxLength={200} /></label><button className="button button-green" type="submit">Search<ArrowIcon /></button></div>
    <div className="filter-options"><span className="filter-caption"><SlidersHorizontal size={14} aria-hidden="true" />Refine</span>
      <label><span className="sr-only">Workplace</span><select name="workplace" aria-label="Workplace" defaultValue={filters.workplace} onChange={(event) => event.currentTarget.form?.requestSubmit()}><option value="">All workplaces</option><option value="REMOTE">Remote</option><option value="HYBRID">Hybrid</option><option value="ON_SITE">On-site</option><option value="UNKNOWN">Unspecified</option></select></label>
      <label><span className="sr-only">Data type</span><select name="mode" aria-label="Data type" defaultValue={filters.mode} onChange={(event) => event.currentTarget.form?.requestSubmit()}><option value="">All data</option><option value="LIVE">Live collections</option><option value="FIXTURE">Sample data</option></select></label>
      <label><span className="sr-only">Last observed</span><select name="freshness" aria-label="Last observed" defaultValue={filters.freshness} onChange={(event) => event.currentTarget.form?.requestSubmit()}><option value="">Any observation date</option><option value="1">Observed in 24 hours</option><option value="7">Observed in 7 days</option><option value="30">Observed in 30 days</option></select></label>
      {filters.source && <input type="hidden" name="source" value={filters.source} />}
      <input type="hidden" name="limit" value={filters.limit} />
      {(filters.title || filters.location || filters.workplace || filters.mode || filters.freshness || filters.source) && <a href="/" className="clear-filters">Clear filters</a>}
    </div>
  </form>;
}
function ArrowIcon() { return <span aria-hidden="true">↗</span>; }
