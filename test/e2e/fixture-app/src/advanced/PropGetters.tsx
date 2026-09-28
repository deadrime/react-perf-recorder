import { memo, useState } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from '../basics/Case';

const BROKEN = `
const { highlighted, getItemProps } = useMenu(items);   // a combobox package's hook
…
{items.map((item, index) => (
  <Option key={item} item={item} highlighted={index === highlighted} {...getItemProps({ item, index })} />   // ← new handlers every render
))}

const Option = memo(…);`;

const FIXED = `
const Option = memo(
  OptionView,
  (a, b) => a.item === b.item && a.highlighted === b.highlighted && a.selected === b.selected   // ← the handlers do the same thing, skip them
);`;

const FRUITS = ['apple', 'apricot', 'banana', 'blueberry', 'cherry', 'fig', 'grape', 'kiwi', 'lemon', 'mango', 'melon', 'orange'];

/** What a combobox package hands out: the state, and a getter that builds each option's props on every call. */
function useMenu() {
  const [highlighted, setHighlighted] = useState(-1);
  const [selected, setSelected] = useState<string | null>(null);
  const getItemProps = ({ item, index }: { item: string; index: number }) => ({
    onMouseEnter: () => setHighlighted(index),
    onClick: () => setSelected(item),
    selected: selected === item,
  });
  return { highlighted, selected, getItemProps, reset: () => setHighlighted(-1) };
}

interface OptionProps {
  side: string;
  item: string;
  highlighted: boolean;
  selected: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}

/** Called by the two options below, not rendered as a component of its own. */
const OptionView = ({ side, item, highlighted, selected, onMouseEnter, onClick }: OptionProps) => (
  <li
    className={highlighted ? 'row on' : 'row'}
    data-testid={`option-${side}`}
    data-item={item}
    aria-selected={selected}
    onMouseEnter={onMouseEnter}
    onClick={onClick}
  >
    <span className="grow">
      {selected ? '✓ ' : ''}
      {item}
    </span>
    <RenderCount renders={useRenderCount()} />
  </li>
);

// Named apart, so a recording tells the two menus' options from each other.
const OptionByProps = memo(function OptionByProps(props: OptionProps) {
  return OptionView(props);
});

const OptionByCompare = memo(
  function OptionByCompare(props: OptionProps) {
    return OptionView(props);
  },
  (a, b) => a.item === b.item && a.highlighted === b.highlighted && a.selected === b.selected
);

const Menu = ({ side, Option }: { side: string; Option: typeof OptionByProps }) => {
  const menu = useMenu();
  return (
    <ul className="rows" data-testid={`menu-${side}`} onMouseLeave={menu.reset}>
      {FRUITS.map((item, index) => (
        <Option key={item} side={side} item={item} highlighted={index === menu.highlighted} {...menu.getItemProps({ item, index })} />
      ))}
    </ul>
  );
};

export const PropGetters = () => (
  <Case
    title="a prop getter makes every option new"
    what={
      <>
        Both menus take their options' props from a getter, the way combobox packages hand them out. The getter builds new handlers on every call, so
        the memo on the left lets every option through each time the pointer moves to the next one. On the right the memo compares only what the
        option shows, and the two options whose highlight changed are the only ones that render. Move the pointer down each menu.
      </>
    }
  >
    <div className="two">
      <Panel
        kind="broken"
        title="memo(Option)"
        says="The recorder says: every option renders; parent: props new ref, same content: onMouseEnter, onClick."
        code={BROKEN}
      >
        <Menu side="props" Option={OptionByProps} />
      </Panel>
      <Panel
        kind="fixed"
        title="memo(Option, areEqual)"
        says="The recorder says: the two options whose highlight changed; parent: props highlighted."
        code={FIXED}
      >
        <Menu side="compare" Option={OptionByCompare} />
      </Panel>
    </div>
  </Case>
);
