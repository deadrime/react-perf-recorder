import type { ReactNode } from 'react';
import { useFormContext, useFormState, type FieldValues, type Path, type RegisterOptions } from 'react-hook-form';

interface FieldProps<T extends FieldValues> {
  name: Path<T>;
  label: string;
  hint?: ReactNode;
  rules?: RegisterOptions<T, Path<T>>;
}

function FieldShell({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint muted small">{hint}</span>}
    </label>
  );
}

function useFieldError<T extends FieldValues>(name: Path<T>) {
  const { errors } = useFormState<T>({ name });
  return errors[name]?.message as string | undefined;
}

export function TextField<T extends FieldValues>({ name, label, hint, rules, ...input }: FieldProps<T> & { placeholder?: string; prefix?: string }) {
  const { register } = useFormContext<T>();
  const error = useFieldError<T>(name);
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <span className="input-wrap">
        {input.prefix && <span className="input-prefix muted">{input.prefix}</span>}
        <input className="input" placeholder={input.placeholder} {...register(name, rules)} data-testid={`field-${name}`} />
      </span>
    </FieldShell>
  );
}

export function TextArea<T extends FieldValues>({ name, label, hint, rules, rows = 4 }: FieldProps<T> & { rows?: number }) {
  const { register } = useFormContext<T>();
  const error = useFieldError<T>(name);
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <textarea className="input" rows={rows} {...register(name, rules)} data-testid={`field-${name}`} />
    </FieldShell>
  );
}

export function SelectField<T extends FieldValues>({
  name,
  label,
  hint,
  options,
}: FieldProps<T> & { options: Array<{ value: string; label: string }> }) {
  const { register } = useFormContext<T>();
  return (
    <FieldShell label={label} hint={hint}>
      <select className="input" {...register(name)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function SaveBar({ onReset, saved }: { onReset(): void; saved: boolean }) {
  const { isDirty, isSubmitting } = useFormState();
  return (
    <div className="savebar">
      {saved && !isDirty && <span className="muted small">Saved</span>}
      <div className="grow" />
      <button type="button" className="btn btn-ghost btn-md" disabled={!isDirty || isSubmitting} onClick={onReset}>
        Discard
      </button>
      <button type="submit" className="btn btn-primary btn-md" disabled={!isDirty || isSubmitting} data-testid="save">
        {isSubmitting ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}
