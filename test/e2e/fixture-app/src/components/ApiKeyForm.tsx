import { useState } from 'react';

/** A form with a secret: recordings must keep the label of the field and never its value. */
export const ApiKeyForm = () => {
  const [label, setLabel] = useState('');
  return (
    <form data-testid="api-key-form" onSubmit={(e) => e.preventDefault()}>
      <input name="label" data-testid="key-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="key label" />
      <input name="secret" data-testid="key-secret" type="password" placeholder="api secret" />
      <button type="submit">Save</button>
    </form>
  );
};
