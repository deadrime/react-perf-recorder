import { Counter } from '../../components/Counter';

export default async function Page() {
  const items = ['a', 'b'];
  return (
    <main>
      <h1>Server {items.length}</h1>
      <Counter tickMs={150} />
    </main>
  );
}
