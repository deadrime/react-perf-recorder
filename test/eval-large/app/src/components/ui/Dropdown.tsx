import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';
import { cx } from '../../lib/cx';
import { fuzzyScore } from '../../lib/search';
import { Icon } from './Icon';

export interface Option<T> {
  value: T;
  label: string;
  icon?: ReactNode;
  hint?: string;
}

interface Props<T> {
  trigger: ReactNode;
  options: Option<T>[];
  selected: T[];
  onSelect(value: T): void;
  multiple?: boolean;
  searchable?: boolean;
  placeholder?: string;
  align?: 'left' | 'right';
  testId?: string;
  className?: string;
}

export function Dropdown<T extends string | number>({
  trigger,
  options,
  selected,
  onSelect,
  multiple,
  searchable,
  placeholder,
  align = 'left',
  testId,
  className,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useClickOutside(root, () => setOpen(false), open);

  const shown = useMemo(
    () =>
      query
        ? options
            .map((o) => ({ o, score: fuzzyScore(query, o.label) }))
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((x) => x.o)
        : options,
    [options, query]
  );

  const choose = (value: T) => {
    onSelect(value);
    if (!multiple) setOpen(false);
  };

  return (
    <div className={cx('dropdown', className)} ref={root} data-testid={testId}>
      <button
        type="button"
        className="dropdown-trigger"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setQuery('');
          setActive(0);
        }}
      >
        {trigger}
      </button>
      {open && (
        <div className={cx('menu', align === 'right' && 'menu-right')} role="listbox">
          {searchable && (
            <input
              autoFocus
              className="menu-search"
              placeholder={placeholder ?? 'Filter…'}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, shown.length - 1));
                else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
                else if (e.key === 'Enter' && shown[active]) choose(shown[active].value);
                else if (e.key === 'Escape') setOpen(false);
              }}
            />
          )}
          <ul>
            {shown.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={selected.includes(o.value)}
                className={cx('menu-item', i === active && 'menu-item-active')}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.value)}
              >
                {o.icon}
                <span className="grow">{o.label}</span>
                {o.hint && <span className="muted small">{o.hint}</span>}
                {selected.includes(o.value) && <Icon name="check" size={14} />}
              </li>
            ))}
            {!shown.length && <li className="menu-empty">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
