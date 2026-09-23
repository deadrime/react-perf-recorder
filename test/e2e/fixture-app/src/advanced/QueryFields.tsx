import { useQuery } from '@tanstack/react-query';
import { Case, Panel, RenderCount, useRenderCount } from '../basics/Case';

const BROKEN = `
const Inbox = () => {
  const { data, ...query } = useQuery({ queryKey: ['inbox'], queryFn, refetchInterval: 1000 });   // ← ...query reads every field
  return <List items={data} {...query} />;
};`;

const FIXED = `
const Inbox = () => {
  const { data } = useQuery({ queryKey: ['inbox'], queryFn, refetchInterval: 1000 });   // ← only data is watched
  return <List items={data} />;
};`;

const MESSAGES = ['Standup moved to 11', 'Release notes are up', 'Lunch?'];
/** The server answers the same thing every time: react-query keeps the same array when the content is the same. */
const fetchInbox = async () => MESSAGES.map((text, i) => ({ id: i, text }));

const Message = ({ text }: { text: string }) => (
  <li>
    <span className="grow">{text}</span>
    <RenderCount n={useRenderCount()} />
  </li>
);

const List = ({ items }: { items?: Array<{ id: number; text: string }> }) => (
  <ul className="rows">
    {(items ?? []).map((m) => (
      <Message key={m.id} text={m.text} />
    ))}
  </ul>
);

/**
 * react-query renders a component only for the fields it read. The rest of the result is spread, so every field is
 * read — isFetching included — and each poll renders the list with the same data.
 */
const InboxWithRest = () => {
  const { data, ...query } = useQuery({ queryKey: ['inbox', 'rest'], queryFn: fetchInbox, refetchInterval: 700 });
  return <List items={data} {...(query as object)} />;
};

const InboxWithData = () => {
  const { data } = useQuery({ queryKey: ['inbox', 'data'], queryFn: fetchInbox, refetchInterval: 700 });
  return <List items={data} />;
};

export const QueryFields = () => (
  <Case
    title="read only the fields you show"
    what={
      <>
        Both inboxes poll the server every 0.7 seconds and get the same three messages back. react-query tracks which fields of its result a component
        reads and renders it only when one of those changes. On the left the rest of the result is spread into the list, which reads all of them —{' '}
        <code>isFetching</code> goes up and down on every poll, and the list renders for nothing each time. On the right only <code>data</code> is
        read, and it is the same array.
      </>
    }
  >
    <div className="two">
      <Panel
        kind="broken"
        title="const { data, ...query }"
        says="The recorder says: query causes on every poll, and renders with the same data."
        code={BROKEN}
      >
        <InboxWithRest />
      </Panel>
      <Panel
        kind="fixed"
        title="const { data }"
        says="The recorder says nothing after the first answer: the polls change nothing it reads."
        code={FIXED}
      >
        <InboxWithData />
      </Panel>
    </div>
  </Case>
);
