// @vitest-environment node
import { safeUrl } from '../../src/shared/url';

const JWT =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5MDAyNmYxYi1jMDJhLTRlYTgtODBkMy1jNTU4ODk0NzI4MjciLCJkZWJ1ZyI6dHJ1ZX0.CGpZXHqJDp9ql7Q2-MbWOw68jIeYMzueaNSOoRIADJY';

describe('the url a recording keeps', () => {
  it('drops a token out of the path, and keeps the rest readable', () => {
    expect(safeUrl(`https://app.example.dev/debug/${JWT}`)).toBe('https://app.example.dev/debug/***');
    expect(safeUrl(`/debug/${JWT}?tab=orders`)).toBe('/debug/***?tab=orders');
    expect(safeUrl('https://app.example.dev/orders/8f3c1b2a?tab=open')).toBe('https://app.example.dev/orders/8f3c1b2a?tab=open');
  });

  it('drops one out of the query and the fragment, by name or by shape', () => {
    expect(safeUrl('/app?access_token=abc123&tab=orders')).toBe('/app?access_token=***&tab=orders');
    expect(safeUrl(`/app?next=${JWT}`)).toBe('/app?next=***');
    // `state` is an OAuth nonce, not a secret: masking it would only make the url harder to recognise.
    expect(safeUrl('/app#access_token=abc&state=xyz')).toBe('/app#access_token=***&state=xyz');
  });

  it('keeps an ordinary url exactly as it is', () => {
    for (const url of ['http://localhost:5391/bug/whole-object?tick=150', '/basics/keys', 'https://example.com/a/b?c=1#top']) {
      expect(safeUrl(url)).toBe(url);
    }
  });

  it('takes credentials out of the authority too, and survives what is not a url', () => {
    expect(safeUrl('https://user:secret@example.com/a')).toBe('https://example.com/a');
    expect(safeUrl(`not a url ${JWT}`)).toBe('not a url ***');
    expect(safeUrl('')).toBe('');
  });
});
