import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHotkey } from '../../hooks/useHotkey';
import { cx } from '../../lib/cx';
import { fuzzyScore } from '../../lib/search';
import { useProjects } from '../../queries/workspace';
import { useAppSelector } from '../../store';
import { useAppStore } from '../../store/app';
import { selectAllIssues } from '../../store/selectors';
import { StatusIcon } from '../ui/Badges';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';

interface Item {
  id: string;
  label: string;
  hint: string;
  to: string;
  icon: ReactNode;
}

const PAGES: Item[] = [
  { id: 'go-inbox', label: 'Go to Inbox', hint: 'G I', to: '/inbox', icon: <Icon name="inbox" /> },
  { id: 'go-issues', label: 'Go to Issues', hint: 'G L', to: '/issues', icon: <Icon name="issues" /> },
  { id: 'go-board', label: 'Go to Board', hint: 'G B', to: '/board', icon: <Icon name="board" /> },
  { id: 'go-dashboard', label: 'Go to Dashboard', hint: 'G D', to: '/dashboard', icon: <Icon name="dashboard" /> },
  { id: 'go-settings', label: 'Open settings', hint: '', to: '/settings', icon: <Icon name="settings" /> },
];

function Palette({ onClose }: { onClose(): void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const deferred = useDeferredValue(query);
  const issues = useAppSelector(selectAllIssues);
  const { data: projects = [] } = useProjects();
  const navigate = useNavigate();

  const items = useMemo(() => {
    const all: Item[] = [
      ...PAGES,
      ...projects.map((p) => ({
        id: p.id,
        label: p.name,
        hint: 'Project',
        to: `/board?project=${p.id}`,
        icon: <span className="dot" style={{ background: p.color }} />,
      })),
      ...issues.map((i) => ({ id: i.id, label: `${i.key} ${i.title}`, hint: '', to: `/issues/${i.key}`, icon: <StatusIcon status={i.status} /> })),
    ];
    if (!deferred) return all.slice(0, 12);
    return all
      .map((item) => ({ item, score: fuzzyScore(deferred, item.label) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((x) => x.item);
  }, [deferred, issues, projects]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    navigate(item.to);
    onClose();
  };

  return (
    <Modal onClose={onClose} label="Command palette" className="palette">
      <input
        className="palette-input"
        placeholder="Type a command or search issues…"
        value={query}
        data-testid="palette-input"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, items.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter') go(items[active]);
        }}
      />
      <ul className="palette-list">
        {items.map((item, i) => (
          <li
            key={item.id}
            className={cx('palette-item', i === active && 'palette-item-on')}
            onMouseEnter={() => setActive(i)}
            onClick={() => go(item)}
          >
            {item.icon}
            <span className="grow ellipsis">{item.label}</span>
            {item.hint && <span className="muted small">{item.hint}</span>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function CommandPalette() {
  const open = useAppStore((s) => s.commandOpen);
  const setOpen = useAppStore((s) => s.setCommandOpen);
  useHotkey('mod+k', (e) => {
    e.preventDefault();
    setOpen(!open);
  });
  return open ? <Palette onClose={() => setOpen(false)} /> : null;
}
