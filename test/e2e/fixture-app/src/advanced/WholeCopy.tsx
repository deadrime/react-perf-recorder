import { memo, useCallback, useState } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from '../basics/Case';

const BROKEN = `
const onChange = (group, field, text) =>
  setValues((values) => {
    const next = structuredClone(values);   // ← every group is a new object, the one typed in and all the others
    next[group][field] = text;
    return next;
  });`;

const FIXED = `
const onChange = (group, field, text) =>
  setValues((values) => ({
    ...values,
    [group]: { ...values[group], [field]: text },   // ← a new object for the group typed in; the rest keep theirs
  }));`;

type Values = Record<string, Record<string, string>>;
const INITIAL: Values = {
  contact: { name: 'Ada', email: 'ada@example.com' },
  address: { street: 'Main St 1', city: 'London' },
  work: { company: 'Analytical', title: 'Engineer' },
  extra: { phone: '555-0100', notes: '' },
};
type OnChange = (group: string, field: string, text: string) => void;

const Group = memo(({ side, name, value, onChange }: { side: string; name: string; value: Record<string, string>; onChange: OnChange }) => {
  const renders = useRenderCount();
  return (
    <li>
      <span className="label">{name}</span>
      {Object.entries(value).map(([field, text]) => (
        <input key={field} data-testid={`${side}-${name}-${field}`} value={text} onChange={(e) => onChange(name, field, e.target.value)} />
      ))}
      <RenderCount renders={renders} />
    </li>
  );
});

const Form = ({ side, copy }: { side: string; copy: (values: Values, group: string, field: string, text: string) => Values }) => {
  const [values, setValues] = useState(INITIAL);
  const onChange = useCallback<OnChange>((group, field, text) => setValues((v) => copy(v, group, field, text)), [copy]);
  return (
    <ul className="rows">
      {Object.entries(values).map(([name, value]) => (
        <Group key={name} side={side} name={name} value={value} onChange={onChange} />
      ))}
    </ul>
  );
};

const cloneAll = (values: Values, group: string, field: string, text: string) => {
  const next = structuredClone(values);
  next[group][field] = text;
  return next;
};

const copyPath = (values: Values, group: string, field: string, text: string) => ({ ...values, [group]: { ...values[group], [field]: text } });

export const WholeCopy = () => (
  <Case
    title="a copy of the whole form for one field"
    what={
      <>
        Each group of fields is a <code>memo</code> that gets its own slice of the form. On the left a keystroke clones the whole form and writes one
        field into the copy: every slice is a new object with the same content, and every group renders. On the right only the path to the field is
        copied. Seen in react-jsonschema-form: a <code>structuredClone</code> of <code>formData</code> on each change renders every field of the form.
      </>
    }
  >
    <div className="two">
      <Panel
        kind="broken"
        title="structuredClone(values)"
        says="The recorder says: parent: props new ref, same content: value — on every group, for a letter typed into one."
        code={BROKEN}
      >
        <Form side="broken" copy={cloneAll} />
      </Panel>
      <Panel
        kind="fixed"
        title="{ ...values, [group]: … }"
        says="The recorder says: parent: props value — on the group typed into, and nothing on the others."
        code={FIXED}
      >
        <Form side="fixed" copy={copyPath} />
      </Panel>
    </div>
  </Case>
);
