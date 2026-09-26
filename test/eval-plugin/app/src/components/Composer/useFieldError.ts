import { useLayoutEffect, useState } from 'react';
import { get, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

type FieldError = { invalid: boolean; message?: string };

const read = (errors: object, name: string): FieldError => {
  const error = get(errors, name);
  return { invalid: Boolean(error), message: error?.message };
};

/** The error of one field, updated when that field's error changes. */
export function useFieldError<T extends FieldValues>(control: Control<T>, name: FieldPath<T>) {
  const [state, setState] = useState(() => read(control._formState.errors, name));
  useLayoutEffect(
    () =>
      control._subscribe({
        name,
        exact: true,
        formState: { errors: true },
        callback: ({ errors }) => {
          const next = read(errors ?? {}, name);
          setState((prev) => (prev.invalid === next.invalid && prev.message === next.message ? prev : next));
        },
      }),
    [control, name]
  );
  return state;
}
