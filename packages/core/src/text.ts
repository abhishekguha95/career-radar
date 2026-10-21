import { convert } from 'html-to-text';
import { z } from 'zod';

export const sourceWebUrlSchema = z.url().max(4000).refine((value) => {
  const url = new URL(value);
  return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
}, 'Expected an HTTP(S) URL without credentials');

export function htmlToText(html: string): string {
  return convert(html, {
    wordwrap: false, preserveNewlines: true,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } }, { selector: 'img', format: 'skip' },
      { selector: 'script', format: 'skip' }, { selector: 'style', format: 'skip' },
    ],
  }).trim();
}
