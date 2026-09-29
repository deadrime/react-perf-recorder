'use client';

import { Counter } from '../../components/Counter';

// Rendered on the client only: the app router with no server component of the app's in it.
export default function Page() {
  return <Counter tickMs={150} />;
}
