import { mappedSite, mappedSites, onSitesMapped, positionKey, resetSites, setSiteMapper, type Position } from '../../src/core/sites';

const position: Position = { url: 'http://localhost:5173/src/components/Row.tsx', line: 81, column: 35 };

describe('built positions the dev server maps back', () => {
  beforeEach(() => resetSites());
  afterEach(() => {
    setSiteMapper(null);
    resetSites();
  });

  it('asks once for a batch, tells the panel when the answer is in, and keeps it', async () => {
    const asked: Position[][] = [];
    setSiteMapper(async (positions) => {
      asked.push(positions);
      return { [positionKey(position)]: 'src/components/Row.tsx:64' };
    });
    let redraws = 0;
    onSitesMapped(() => redraws++);

    // Nothing to show yet, and asking again before the answer does not ask again.
    expect(mappedSite(position)).toBeUndefined();
    expect(mappedSite(position)).toBeUndefined();
    await mappedSites();

    expect(asked).toEqual([[position]]);
    expect(mappedSite(position)).toBe('src/components/Row.tsx:64');
    expect(redraws).toBe(1);
  });

  it('does not ask twice for a position the server could not map', async () => {
    let calls = 0;
    setSiteMapper(async () => {
      calls++;
      return {};
    });
    mappedSite(position);
    await mappedSites();
    expect(mappedSite(position)).toBeUndefined();
    await mappedSites();
    expect(calls).toBe(1);
  });

  it('asks again after a request failed, since the dev server may just have been restarting', async () => {
    let calls = 0;
    setSiteMapper(async () => {
      calls++;
      throw new Error('offline');
    });
    mappedSite(position);
    await mappedSites();
    mappedSite(position);
    await mappedSites();
    expect(calls).toBe(2);
  });
});
