import { useState } from 'react';
import { captureReactWarnings, classify } from '../../src/core/env/react-warnings';
import { flush, makeRecorder, mount } from './helpers';

describe('React warnings', () => {
  it('reads the warnings of React 18 and 19 as they are printed, with the components they name', () => {
    expect(
      classify(
        'Warning: Each child in a list should have a unique "key" prop.\n\nCheck the render method of `Rows`. See https://reactjs.org/link/warning-keys for more information.'
      )
    ).toMatchObject({
      kind: 'key',
      text: expect.stringContaining('a list in Rows renders children without a key'),
    });
    expect(
      classify(
        'Each child in a list should have a unique "key" prop.\n\nCheck the render method of `Rows`. See https://react.dev/link/warning-keys for more information.'
      )?.text
    ).toContain('in Rows');
    expect(classify('Encountered two children with the same key, `a`. Keys should be unique\n    at Rows (http://x/Rows.tsx:3:1)')?.text).toBe(
      'two children in Rows share the key "a": React may drop, duplicate or remount them'
    );
    expect(classify('Cannot update a component (`Header`) while rendering a different component (`Row`). To locate the bad setState()')?.text).toBe(
      'Row sets the state of Header while it renders: a second render pass each time'
    );
    expect(classify('Maximum update depth exceeded. This can happen when a component calls setState inside useEffect')?.kind).toBe('update-depth');
    expect(classify('Warning: validateDOMNesting(...): <div> cannot appear as a descendant of <p>.')).toBeNull();
  });

  it('puts the warnings React printed into the recording, the ones from before it marked so', () => {
    // A silent console under the wrapper: what React prints reaches the wrapper and goes no further.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete (console as { __rprWarnings?: true }).__rprWarnings;
    captureReactWarnings();
    let setCount!: (n: number) => void;
    const Header = () => {
      const [n, set] = useState(0);
      setCount = set;
      return <h1>{n}</h1>;
    };
    const Row = ({ n }: { n: number }) => {
      if (n === 1) setCount(1);
      return <li>{n}</li>;
    };
    const Rows = ({ items }: { items: number[] }) => (
      <ul>
        {items.map((n) => (
          <Row n={n} />
        ))}
      </ul>
    );
    const page = mount(
      <>
        <Header />
        <Rows items={[0]} />
      </>
    );
    const { recorder } = makeRecorder();
    recorder.start();
    page.rerender(
      <>
        <Header />
        <Rows items={[0, 1]} />
      </>
    );
    flush(() => {});
    const warnings = recorder.stop().warnings.filter((w) => w.startsWith('React warned'));
    errors.mockRestore();
    expect(warnings).toContainEqual(expect.stringMatching(/^React warned: a list in Rows renders children without a key.*, before the recording$/));
    expect(warnings).toContainEqual('React warned: Row sets the state of Header while it renders: a second render pass each time');
  });
});
