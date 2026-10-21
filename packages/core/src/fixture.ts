import { readFile } from 'node:fs/promises';
import { sourceConfigSchema } from '@career-radar/contracts';
import type { SourceConfig } from '@career-radar/contracts';
import { z } from 'zod';
import { SourceError } from './adapter.js';
import type { PostingAdapter, SourcePage } from './adapter.js';
import { LEVER_MAPPING_VERSION, normalizeLever } from './lever.js';

const fixtureSchema = z.object({
  source: sourceConfigSchema,
  observedAt: z.iso.datetime({ offset: true }),
  pages: z.array(z.union([
    z.object({ items: z.array(z.unknown()).max(100) }).strict(),
    z.object({ error: z.object({ code: z.string().min(1).max(100), message: z.string().max(200) }).strict() }).strict(),
  ])).min(1).max(100),
}).strict();
export type Fixture = z.infer<typeof fixtureSchema>;

export async function readFixture(path: string): Promise<Fixture> {
  const bytes = await readFile(path);
  if (bytes.byteLength > 8 * 1024 * 1024) throw new SourceError('FIXTURE_TOO_LARGE', 'Fixture exceeds the byte limit');
  return fixtureSchema.parse(JSON.parse(bytes.toString('utf8')));
}

export class FixtureAdapter implements PostingAdapter {
  readonly fixture: Fixture;

  constructor(fixture: unknown) {
    this.fixture = fixtureSchema.parse(fixture);
  }

  normalize = normalizeLever;

  async fetchPage(source: SourceConfig, page: number): Promise<SourcePage> {
    if (JSON.stringify(sourceConfigSchema.parse(source)) !== JSON.stringify(this.fixture.source)) {
      throw new SourceError('SOURCE_MISMATCH', 'Fixture source does not match the configured source');
    }
    const item = this.fixture.pages[page];
    if (!item) throw new SourceError('FIXTURE_PAGE_MISSING', 'Fixture page does not exist');
    if ('error' in item) throw new SourceError(item.error.code, item.error.message);
    return {
      items: item.items,
      hasMore: page + 1 < this.fixture.pages.length,
      provenance: {
        requestUrl: `fixture://lever/${this.fixture.source.region}/${this.fixture.source.site}?page=${page}`,
        observedAt: this.fixture.observedAt,
        mappingVersion: LEVER_MAPPING_VERSION,
        mode: 'FIXTURE', page,
      },
    };
  }
}
