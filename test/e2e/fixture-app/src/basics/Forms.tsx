import { useState, type ReactNode } from 'react';
import { useForm, useWatch, type Control } from 'react-hook-form';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

const BROKEN = `
const Form = () => {
  const [values, setValues] = useState({ title: '', note: '' });   // ← every keystroke is the form's state

  return (
    <>
      <input value={values.title} onInput={(e) => setValues((v) => ({ ...v, title: e.target.value }))} />
      <input value={values.note} onInput={(e) => setValues((v) => ({ ...v, note: e.target.value }))} />
      <p>preview: {values.title}</p>
    </>
  );
};`;

const FIXED = `
const Preview = ({ control }) => {
  const title = useWatch({ control, name: 'title' });   // ← subscribed to the one field it prints
  return <p>preview: {title}</p>;
};

const Form = () => {
  const { register, control } = useForm({ defaultValues: { title: '', note: '' } });

  return (
    <>
      <input {...register('title')} />   // ← the value stays in the DOM
      <input {...register('note')} />
      <Preview control={control} />
    </>
  );
};`;

interface Values {
  title: string;
  note: string;
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <li>
    <span className="label">{label}</span>
    {children}
    <RenderCount renders={useRenderCount()} />
  </li>
);

/** Every keystroke goes through the form's own state, so the whole form renders with it. */
const ControlledForm = () => {
  const [values, setValues] = useState<Values>({ title: '', note: '' });
  return (
    <ul className="rows">
      <Field label="title">
        <input
          data-testid="c-title"
          value={values.title}
          onInput={(e) => setValues((v) => ({ ...v, title: (e.target as HTMLInputElement).value }))}
        />
      </Field>
      <Field label="note">
        <input data-testid="c-note" value={values.note} onInput={(e) => setValues((v) => ({ ...v, note: (e.target as HTMLInputElement).value }))} />
      </Field>
      <li>
        <span className="grow">
          preview: <b>{values.title || '…'}</b>
        </span>
        <RenderCount renders={useRenderCount()} />
      </li>
    </ul>
  );
};

/** Only the preview asks for the value, and it asks for one field of it. */
const Preview = ({ control }: { control: Control<Values> }) => {
  const title = useWatch({ control, name: 'title' });
  return (
    <li>
      <span className="grow">
        preview: <b>{title || '…'}</b>
      </span>
      <RenderCount renders={useRenderCount()} />
    </li>
  );
};

const UncontrolledForm = () => {
  const { register, control } = useForm<Values>({ defaultValues: { title: '', note: '' } });
  return (
    <ul className="rows">
      <Field label="title">
        <input data-testid="u-title" {...register('title')} />
      </Field>
      <Field label="note">
        <input data-testid="u-note" {...register('note')} />
      </Field>
      <Preview control={control} />
    </ul>
  );
};

export const Forms = () => (
  <Case
    title="a form's values: useState or react-hook-form"
    what={
      <>
        Not a bug but a choice of where a form keeps its values. Both forms have the same two fields and a preview of the title. On the left the
        values are <code>useState</code> in the form: each letter is new state at its root, and the form, both fields and the preview render. On the
        right react-hook-form keeps the values in the DOM (<code>register</code>) and lets the one component that shows a value subscribe to it (
        <code>useWatch</code>): only the preview renders. The same works without a library — uncontrolled inputs read with <code>FormData</code>, and
        a small store for what the page shows as you type.
      </>
    }
  >
    <div className="two">
      <Panel
        kind="broken"
        title="useState in the form"
        says="The recorder says: ControlledForm is the root on every letter, through its state, and each Field renders with parent: children."
        code={BROKEN}
      >
        <ControlledForm />
      </Panel>
      <Panel
        kind="fixed"
        title="react-hook-form: register + useWatch"
        says="The recorder says: Preview alone, once a letter, through useWatch. The fields do not render as you type."
        code={FIXED}
      >
        <UncontrolledForm />
      </Panel>
    </div>
  </Case>
);
