import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { boot } from '../../src/client';
import { noteRoot } from '../../src/core/roots-notify';

/** React Router and Remix render the whole document on the server and hydrate `document` itself. */
const Document = () => (
  <html lang="en">
    <head>
      <title>ssr</title>
    </head>
    <body>
      <main>app</main>
    </body>
  </html>
);

const config = {
  version: 'test',
  projectRoot: '/app',
  wrapperPattern: '^(Anonymous|ForwardRef|Memo)$',
  actions: { values: false, secretSelector: '[data-rpr-secret]' },
  maxDurationMs: 60_000,
  bigCommit: 150,
  timelineLimit: 5000,
  timers: false,
  endpoint: null,
  panel: { corner: 'bottom-left' as const, highlight: false, shortcuts: { record: 'Alt+Shift+KeyR', pick: 'Alt+Shift+KeyS' } },
};

describe('a page React hydrates whole', () => {
  it('keeps the panel off <html> until the document has hydrated', async () => {
    const html = renderToString(<Document />);
    document.documentElement.innerHTML = html.replace(/^<html[^>]*>|<\/html>$/g, '');
    const { panel } = boot(config, []);
    const host = panel!.host;
    expect(host.parentNode).toBe(document.documentElement);

    const errors: unknown[] = [];
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(document, <Document />, { onRecoverableError: (error) => errors.push(error) });
      noteRoot(root as unknown as { _internalRoot?: never });
      // React 18 would take a node it did not render on <html> for a mismatch and render the page on the client.
      expect(host.isConnected).toBe(false);
    });
    expect(errors).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(host.parentNode).toBe(document.documentElement);
    act(() => root.unmount());
  });
});
