import { createContext, memo, useContext, useReducer, useState } from 'react';
import { reasonLine } from '../../src/shared/summary';
import { flush, makeRecorder, mount, reasonPairs, reasonsOf } from './helpers';

type Setter = (n: number) => void;

describe('render reasons', () => {
  it('names the props that broke memo and the ones that only got a new reference', () => {
    let bump!: Setter;
    const Row = memo(({ price, style, onClick }: { price: number; style: object; onClick: () => void }) => (
      <tr style={style as never} onClick={onClick}>
        <td>{price}</td>
      </tr>
    ));
    Row.displayName = 'Row';
    const Plain = ({ label }: { label: string }) => <span>{label}</span>;
    const Table = () => {
      const [n, setN] = useState(0);
      bump = setN;
      return (
        <table>
          <tbody>
            <Row price={Math.floor(n / 2)} style={{ color: 'red' }} onClick={() => {}} />
          </tbody>
          <caption>
            <Plain label="fixed" />
          </caption>
        </table>
      );
    };
    mount(<Table />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => bump(1));
    flush(() => bump(2));
    const rec = recorder.stop();
    const row = rec.components.find((c) => c.name === 'Row')!;
    expect(row.memo).toBe(true);
    expect(row.byParent).toBe(2);
    expect(reasonsOf(rec, row).sort()).toEqual([
      'parent: props new ref, same content: style, onClick',
      'parent: props price | new ref, same content: style, onClick',
    ]);
    expect(reasonPairs(rec, rec.components.find((c) => c.name === 'Plain')!)).toEqual([['parent: same props, memo would skip it', 2]]);
  });

  it('shows a context change that reaches a memo component past its parent', () => {
    const Theme = createContext({ dark: false });
    Theme.displayName = 'Theme';
    const Badge = memo(() => <b>{String(useContext(Theme).dark)}</b>);
    Badge.displayName = 'Badge';
    let toggle!: Setter;
    const App = () => {
      const [dark, setDark] = useState(0);
      toggle = setDark;
      return (
        <Theme.Provider value={{ dark: dark > 0 }}>
          <Badge />
        </Theme.Provider>
      );
    };
    mount(<App />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => toggle(1));
    flush(() => toggle(2));
    const rec = recorder.stop();
    const badge = rec.components.find((c) => c.name === 'Badge')!;
    expect(reasonsOf(rec, badge).sort()).toEqual(['context Theme', 'context Theme SAME-CONTENT']);
  });

  it("names a package's context without a displayName by the component that provides it", () => {
    // A package's context, like dnd-kit's: no displayName, provided inside the package's own component.
    const Internal = createContext({ over: 0 });
    const Card = memo(() => <i>{useContext(Internal).over}</i>);
    Card.displayName = 'Card';
    let move!: Setter;
    const DndContext = ({ children }: { children: React.ReactNode }) => {
      const [over, setOver] = useState(0);
      move = setOver;
      return <Internal.Provider value={{ over }}>{children}</Internal.Provider>;
    };
    mount(
      <DndContext>
        <Card />
      </DndContext>
    );
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => move(1));
    const rec = recorder.stop();
    expect(reasonsOf(rec, rec.components.find((c) => c.name === 'Card')!)).toEqual(['context (unnamed, provided by DndContext)']);
  });

  it('calls a render that set a state to its current value a bailout', () => {
    let dispatch!: (value: number) => void;
    const Radio = () => {
      // useReducer has no eager bailout in React 18: the component renders, then React finds the same state.
      const [focused, set] = useReducer((_: number, next: number) => next, 0);
      dispatch = set;
      return <i>{focused}</i>;
    };
    mount(<Radio />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => dispatch(0));
    const rec = recorder.stop();
    expect(reasonPairs(rec, rec.components.find((c) => c.name === 'Radio')!)).toEqual([['bailout: state set to the same value', 1]]);
  });

  it('names the custom hooks that read a changed context', () => {
    const Theme = createContext({ dark: false });
    Theme.displayName = 'Theme';
    const useTheme = () => useContext(Theme);
    const Badge = () => <b>{String(useTheme().dark)}</b>;
    // A memo boundary that does not re-render: the context change alone starts the cascade at Badge.
    const Middle = memo(() => <Badge />);
    let toggle!: (n: number) => void;
    const App = () => {
      const [dark, setDark] = useState(0);
      toggle = setDark;
      return (
        <Theme.Provider value={{ dark: dark > 0 }}>
          <Middle />
        </Theme.Provider>
      );
    };
    mount(<App />);
    const { recorder } = makeRecorder();
    recorder.start();
    flush(() => toggle(1));
    const rec = recorder.stop();
    const badge = rec.roots.find((r) => r.name === 'Badge')!;
    expect(badge.hooks?.['ctx:Theme']?.path).toEqual(['useTheme', 'Context']);
    expect(reasonLine(badge, rec.reasons[badge.reasons[0][0]], badge.reasons[0][1])).toMatch(/^1× context Theme · useTheme › Context/);
  });
});
