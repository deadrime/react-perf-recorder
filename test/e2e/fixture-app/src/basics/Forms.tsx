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
        <input data-testid="c-title" value={values.title} onInput={(e) => setValues((v) => ({ ...v, title: (e.target as HTMLInputElement).value }))} />
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
    title="a form that does not render while you type"
    what={
      <>
        Two forms with the same two fields and a preview of the title. On the left every keystroke is state in the
        form, so the form and both fields render on each letter. On the right the fields are left to the DOM —{' '}
        <code>register</code> — and only the preview subscribes, to the one field it prints.
      </>
    }
  >
    <div className="two">
      <Panel
        kind="broken"
        title="useState in the form"
        says="The recorder says: the form is a cascade root on every keystroke, with parent: props equal below it."
        code={BROKEN}
      >
        <ControlledForm />
      </Panel>
      <Panel
        kind="fixed"
        title="register + useWatch"
        says="The recorder says: the preview renders, once per letter of the field it watches. The other field never does."
        code={FIXED}
      >
        <UncontrolledForm />
      </Panel>
    </div>
  </Case>
);
