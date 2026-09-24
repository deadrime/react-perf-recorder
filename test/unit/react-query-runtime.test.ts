import { QueryClient } from '@tanstack/query-core';
import { PluginHost } from '../../src/core/plugins';
import type { Fiber } from '../../src/core/fiber';
import plugin from '../../src/plugins/react-query/runtime';

/** A stand-in for the committed tree: the provider fiber once the page has mounted it. */
const tree = (client: QueryClient | null) => ({
  scope: null,
  findFibers: (pred: (f: Fiber) => boolean) => {
    const provider = client ? ({ memoizedProps: { client } } as unknown as Fiber) : null;
    return provider && pred(provider) ? [provider] : [];
  },
});

describe('react-query plugin runtime', () => {
  let now = 0;
  beforeEach(() => {
    now = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => vi.restoreAllMocks());

  it('is inactive when the page has no provider', () => {
    const host = new PluginHost([[plugin, null]]);
    host.start(tree(null), now);
    now += 2000;
    host.commit(tree(null));
    expect(host.stop(tree(null))['react-query']).toMatchObject({ active: false });
  });

  it('finds a provider that mounts after the recording started, and records its queries from then on', async () => {
    const client = new QueryClient();
    const host = new PluginHost([[plugin, null]]);
    host.start(tree(null), now);
    // Looked for again only once a second has passed since the last search.
    now += 300;
    host.commit(tree(client));
    await client.prefetchQuery({ queryKey: ['early'], queryFn: () => 1 });
    expect(host.drain()).toEqual([]);
    now += 1000;
    host.commit(tree(client));
    await client.prefetchQuery({ queryKey: ['late'], queryFn: () => 2 });
    expect(host.drain().map((e) => e.type)).toContain('added ["late"]');
    const section = host.stop(tree(client))['react-query'];
    expect(section).toMatchObject({ active: true });
    expect(section.highlights?.join(' ')).toContain('["late"]');
  });

  it('is active, and says nothing happened, when the provider is there but no query moved', () => {
    const host = new PluginHost([[plugin, null]]);
    host.start(tree(new QueryClient()), now);
    expect(host.stop(tree(null))['react-query']).toMatchObject({ active: true, highlights: ['no query events during the recording'] });
  });
});
