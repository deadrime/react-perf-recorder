import { useEffect, useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback';
import { useHotkey } from '../../hooks/useHotkey';

interface Props {
  value: string;
  onSearch(q: string): void;
}

/** The field answers every key; the list is filtered once the typing stops. */
export function SearchBox({ value, onSearch }: Props) {
  const [text, setText] = useState(value);
  const commit = useDebouncedCallback((q: string) => onSearch(q.trim()), 250);

  // Back and forward in history change the query under us.
  useEffect(() => setText(value), [value]);

  useHotkey('/', (e) => {
    e.preventDefault();
    document.querySelector<HTMLInputElement>('[data-testid="issue-search"]')?.focus();
  });

  return (
    <label className="searchbox">
      <Icon name="search" size={14} />
      <input
        data-testid="issue-search"
        placeholder="Search issues"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit.flush();
          if (e.key === 'Escape') {
            setText('');
            commit('');
            commit.flush();
          }
        }}
      />
    </label>
  );
}
