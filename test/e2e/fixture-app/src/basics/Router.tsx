import { useNavigate, useSearchParams } from 'react-router-dom';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

const CARD_BROKEN = `
const Card = () => {
  const [params] = useSearchParams();   // ← the whole card is subscribed to the URL
  const folder = params.get('folder');

  return (
    <ul>
      <li>folder: {folder}</li>
      {LETTERS.map((subject) => <Letter key={subject} subject={subject} />)}
    </ul>
  );
};`;

const CARD_FIXED = `
const FolderName = () => {
  const [params] = useSearchParams();   // ← only the line that prints it
  return <>folder: {params.get('folder')}</>;
};

const Card = () => (
  <ul>
    <li><FolderName /></li>
    {LETTERS.map((subject) => <Letter key={subject} subject={subject} />)}
  </ul>
);`;

const GO_BROKEN = `
const GoToSent = () => {
  const navigate = useNavigate();   // ← nothing from the URL is shown, and it still subscribes

  return <button onClick={() => navigate({ search: '?folder=sent' })}>go to sent</button>;
};`;

const GO_FIXED = `
const GoToSent = () => <a href="?folder=sent">go to sent</a>;   // ← no hook, no subscription`;

const FOLDERS = ['inbox', 'sent', 'spam'];
const LETTERS = ['Invoice for March', 'Re: the picker tree', 'Your weekly digest'];

/** Not memo, like most lists: whoever renders above it renders it too. */
const Letter = ({ subject }: { subject: string }) => (
  <li>
    <span className="grow">{subject}</span>
    <RenderCount n={useRenderCount()} />
  </li>
);

const useFolder = () => {
  const [params, setParams] = useSearchParams();
  const folder = params.get('folder') ?? FOLDERS[0];
  return [folder, (next: string) => setParams({ folder: next }, { replace: true })] as const;
};

/** Reads the URL where the whole card can see it, so every navigation renders the card and the list below it. */
const WholeCard = () => {
  const [folder] = useFolder();
  return (
    <ul className="rows">
      <li>
        <span className="grow">
          folder: <b>{folder}</b>
        </span>
        <RenderCount n={useRenderCount()} />
      </li>
      {LETTERS.map((subject) => (
        <Letter key={subject} subject={subject} />
      ))}
    </ul>
  );
};

/** The only component that shows the folder is the only one that asks the router for it. */
const FolderName = () => {
  const [folder] = useFolder();
  return (
    <>
      <span className="grow">
        folder: <b>{folder}</b>
      </span>
      <RenderCount n={useRenderCount()} />
    </>
  );
};

const CardWithLeaf = () => (
  <ul className="rows">
    <li>
      <FolderName />
    </li>
    {LETTERS.map((subject) => (
      <Letter key={subject} subject={subject} />
    ))}
  </ul>
);

/** Nothing but useNavigate, and nothing on the screen from the URL — and it still renders on every navigation. */
const NavigatingButton = () => {
  const navigate = useNavigate();
  return (
    <li>
      <button type="button" data-testid="go-hook" onClick={() => navigate({ search: '?folder=sent' })}>
        go to sent
      </button>
      <RenderCount n={useRenderCount()} />
    </li>
  );
};

/** The toolbar is the only thing on this page that reads the URL, so the page itself never renders again. */
const Toolbar = () => {
  const [folder, setFolder] = useFolder();
  return (
    <p className="bar">
      {FOLDERS.map((name) => (
        <button key={name} type="button" data-testid={`folder-${name}`} onClick={() => setFolder(name)}>
          {name}
        </button>
      ))}
      <span className="muted">now: {folder}</span>
    </p>
  );
};

const PlainLink = () => (
  <li>
    <a className="link" data-testid="go-link" href="?folder=sent">
      go to sent
    </a>
    <RenderCount n={useRenderCount()} />
  </li>
);

export const Router = () => {
  return (
    <Case
      title="who needs to know the URL"
      what={
        <>
          Both cards show the same three letters and the folder from the query string. On the left the card itself
          reads the URL, so every switch renders it and everything it holds; on the right only the line that prints
          the folder does.
        </>
      }
    >
      <Toolbar />
      <div className="two">
        <Panel
          kind="broken"
          title="useSearchParams() in the card"
          says="The recorder says: context Location on the card, and every letter under it in the cascade."
          code={CARD_BROKEN}
        >
          <WholeCard />
        </Panel>
        <Panel
          kind="fixed"
          title="useSearchParams() in the line"
          says="The recorder says: one render of the line that shows the folder, and nothing else."
          code={CARD_FIXED}
        >
          <CardWithLeaf />
        </Panel>
      </div>
      <h3 className="pair">and the button that only navigates</h3>
      <div className="two">
        <Panel
          kind="broken"
          title="useNavigate()"
          says="A component that never shows the URL still renders on every navigation."
          code={GO_BROKEN}
        >
          <ul className="rows">
            <NavigatingButton />
          </ul>
        </Panel>
        <Panel
          kind="fixed"
          title="a plain link"
          says="The same navigation, written as the browser understands it: no subscription at all."
          code={GO_FIXED}
        >
          <ul className="rows">
            <PlainLink />
          </ul>
        </Panel>
      </div>
    </Case>
  );
};
