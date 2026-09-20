import { useState } from 'react';

/** A form with a secret: recordings must keep the name of the field and never its value. */
export const WebhookForm = () => {
  const [name, setName] = useState('');
  return (
    <form className="side-form" data-testid="webhook-form" onSubmit={(e) => e.preventDefault()}>
      <input name="name" data-testid="hook-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="webhook name" />
      <input name="secret" data-testid="hook-secret" type="password" placeholder="signing secret" />
      <button type="submit">Save</button>
    </form>
  );
};
