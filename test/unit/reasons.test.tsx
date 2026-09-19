import { createContext, memo, useContext, useReducer, useState } from 'react';
import { flush, makeRecorder, mount } from './helpers';

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
    expect(row.reasons.map(([text]) => text).sort()).toEqual(['parent: props price | same: style, onClick', 'parent: props same: style, onClick']);
    expect(rec.components.find((c) => c.name === 'Plain')!.reasons).toEqual([['parent: props equal', 2]]);
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
    expect(badge.reasons.map(([text]) => text).sort()).toEqual(['context Theme', 'context Theme SAME-CONTENT']);
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
    expect(rec.components.find((c) => c.name === 'Radio')?.reasons).toEqual([['bailout: state set to the same value', 1]]);
  });
});
