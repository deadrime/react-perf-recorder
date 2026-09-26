# Libraries

What a library's name in a root's reason usually means, and what fixes it. The method does not depend on these: a
root that renders through a library's own state is subscribed to more of it than it shows, whatever the library.
These are the ways that happens in the ones seen most.

## react-hook-form

- `[react-hook-form] useForm` on a form's root while typing: the root reads values in its render — `watch()`,
  `getValues()` in JSX, `formState.isDirty` and the like — and so renders with every field under it on each key.
  Move the read into a small component of its own with `useWatch({ name })` or `useFormState({ control })`; `memo` on
  the fields leaves the root rendering. `watch()` with no argument subscribes the root for good wherever it is
  called — in render, in a `useState` initializer, in an effect: read a starting value with `getValues()`, and follow
  changes with `watch(callback)`, the one form that does not. The root's own count in the recording after the fix
  says whether it worked.
- `[react-hook-form] useController › useFormState` on a field: `fieldState`, or a `trigger()` of the whole form,
  subscribes it to every field's errors; read the one error it shows instead.
