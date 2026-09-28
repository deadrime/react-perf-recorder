import { memo, useMemo, useRef, useState, type ReactNode } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useListbox } from '../../hooks/useListbox';
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

interface OptionProps {
  option: Option<string | number>;
  checked: boolean;
  index: number;
  active: boolean;
  onActivate(index: number): void;
  onChoose(index: number): void;
}

const MenuOption = memo(function MenuOption({ option, checked, index, active, onActivate, onChoose }: OptionProps) {
  return (
    <li
      role="option"
      aria-selected={checked}
      className={cx('menu-item', active && 'menu-item-active')}
      onMouseEnter={() => onActivate(index)}
      onClick={() => onChoose(index)}
    >
      {option.icon}
      <span className="grow">{option.label}</span>
      {option.hint && <span className="muted small">{option.hint}</span>}
      {checked && <Icon name="check" size={14} />}
    </li>
  );
});

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
  const { active, setActive, move, getOptionProps } = useListbox(shown.length, (index) => choose(shown[index].value));

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
                if (e.key === 'ArrowDown') move(1);
                else if (e.key === 'ArrowUp') move(-1);
                else if (e.key === 'Enter' && shown[active]) choose(shown[active].value);
                else if (e.key === 'Escape') setOpen(false);
              }}
            />
          )}
          <ul>
            {shown.map((o, i) => (
              <MenuOption key={o.value} option={o} checked={selected.includes(o.value)} {...getOptionProps(i)} />
            ))}
            {!shown.length && <li className="menu-empty">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
