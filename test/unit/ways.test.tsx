/** @jsxImportSource preact */
import { render } from 'preact';
import { StatCard } from '../../src/ui/components/Stats';
import { stateName, type Way } from '../../src/shared/summary';

const way = (links: number): Way => ({
  n: 4,
  cause: 'core:timer setInterval @ src/app/Clock.tsx',
  steps: [{ name: 'Clock', why: 'state now', kind: 'state', what: 'now' }, ...Array.from({ length: links - 1 }, (_, i) => ({ name: `Level${i + 1}`, props: ['now'] }))],
});

const card = (ways: Way[]) => {
  const host = document.createElement('div');
  render(<StatCard name="Leaf" badges={[]} reasons={[]} ways={ways} />, host);
  return host;
};

describe('ways on a card', () => {
  it('a folded way keeps the link where props were equal in sight', () => {
    const long = way(12);
    long.steps[5] = { name: 'Level5', equal: true };
    const names = [...card([long]).querySelectorAll('.way-name')].map((el) => el.textContent);
    expect(names).toEqual(['Clock', 'Level1', 'Level5', 'Level8', 'Level9', 'Level10', 'Level11']);
  });

  it('a short way reads in a row, a long one down the card with its middle folded', async () => {
    const host = card([way(3), way(12)]);
    const [short, long] = [...host.querySelectorAll('[data-rpr="way"]')];
    expect(short.getAttribute('data-column')).toBeNull();
    expect(long.getAttribute('data-column')).toBe('true');
    const names = () => [...long.querySelectorAll('.way-name')].map((el) => el.textContent);
    // The root and the link under it, then the last four: the component itself at the bottom.
    expect(names()).toEqual(['Clock', 'Level1', 'Level8', 'Level9', 'Level10', 'Level11']);
    const more = long.querySelector<HTMLButtonElement>('[data-rpr="way-more"]')!;
    expect(more.textContent).toBe('… 6 more');
    more.click();
    await new Promise((r) => setTimeout(r));
    expect(names()).toHaveLength(12);
    expect(long.querySelector('.way-label')?.textContent).toBe('state');
  });
});

describe('stateName', () => {
  it('names a state by its variable, its custom hook, or the package API', () => {
    expect(stateName({ path: ['State'], code: 'const [selectedId, setSelectedId] = useState<string | null>(null);' })).toBe('selectedId');
    expect(stateName({ path: ['useOverdueByClock', 'useSecond', 'State'], code: 'const due = useOverdueByClock(at);' })).toBe('useSecond');
    expect(stateName({ path: ['useForm', 'State'], library: 'react-hook-form', libraryAt: 0, code: 'const { control } = useForm();' })).toBe('useForm');
    expect(stateName({ path: ['State'], code: 'const pair = useState(0);' })).toBeUndefined();
  });
});
