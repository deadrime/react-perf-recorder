import { useState, type ReactNode } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

const BROKEN = `
const Page = () => {
  const [helpOpen, setHelpOpen] = useState(false);   // ← the page holds the dialog's flag
  return (
    <>
      <button onClick={() => setHelpOpen(true)}>Help</button>
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      <Feed />
    </>
  );
};`;

const FIXED = `
const HelpButton = () => {
  const [open, setOpen] = useState(false);   // ← the flag lives with the button and the dialog
  return (
    <>
      <button onClick={() => setOpen(true)}>Help</button>
      {open && <HelpDialog onClose={() => setOpen(false)} />}
    </>
  );
};

const Page = () => (
  <>
    <HelpButton />
    <Feed />
  </>
);`;

const POSTS = ['Release notes for 0.2', 'How the picker finds a component', 'Recording from the page load'];

const Post = ({ title }: { title: string }) => (
  <li>
    <span className="grow">{title}</span>
    <RenderCount n={useRenderCount()} />
  </li>
);

/** The rest of the page: what opening a dialog has nothing to do with. */
const Feed = () => (
  <ul className="rows">
    {POSTS.map((title) => (
      <Post key={title} title={title} />
    ))}
  </ul>
);

const HelpDialog = ({ side, onClose }: { side: string; onClose: () => void }) => (
  <div className="dialog" role="dialog" data-testid={`dialog-${side}`}>
    <span className="grow">Press Rec, do the slow thing, press Stop.</span>
    <button type="button" data-testid={`close-${side}`} onClick={onClose}>
      Close
    </button>
  </div>
);

const HelpToggle = ({ side, open, onOpen }: { side: string; open: boolean; onOpen: () => void }) => (
  <button type="button" data-testid={`help-${side}`} disabled={open} onClick={onOpen}>
    Help
  </button>
);

const PageWithFlag = () => {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <Frame>
      <HelpToggle side="page" open={helpOpen} onOpen={() => setHelpOpen(true)} />
      {helpOpen ? <HelpDialog side="page" onClose={() => setHelpOpen(false)} /> : null}
      <Feed />
    </Frame>
  );
};

const HelpButton = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <HelpToggle side="button" open={open} onOpen={() => setOpen(true)} />
      {open ? <HelpDialog side="button" onClose={() => setOpen(false)} /> : null}
    </>
  );
};

const PageWithButton = () => (
  <Frame>
    <HelpButton />
    <Feed />
  </Frame>
);

const Frame = ({ children }: { children: ReactNode }) => <div className="stack">{children}</div>;

export const Dialog = () => (
  <Case
    title="a dialog's flag belongs to the dialog"
    what={
      <>
        Both pages have a Help button that opens a dialog above a feed. On the left the page keeps the open flag, so opening and closing the dialog
        renders the page and the whole feed under it. On the right the button keeps the flag with the dialog it opens, and the feed never hears about
        it. Open and close each a couple of times.
      </>
    }
  >
    <div className="two">
      <Panel kind="broken" title="useState in the page" says="The recorder says: the page is the root, and every post renders with it." code={BROKEN}>
        <PageWithFlag />
      </Panel>
      <Panel kind="fixed" title="useState in <HelpButton />" says="The recorder says: the button and the dialog, nothing else." code={FIXED}>
        <PageWithButton />
      </Panel>
    </div>
  </Case>
);
