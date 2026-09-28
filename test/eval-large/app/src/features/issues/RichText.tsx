import { Fragment, memo } from 'react';
import { MEMBERS } from '../../api/seed';

const HANDLES = new Set(MEMBERS.map((m) => m.handle));

/** Paragraphs, `code` and @mentions — all the formatting comments and descriptions get. */
export const RichText = memo(function RichText({ text }: { text: string }) {
  return (
    <div className="rich">
      {text.split(/\n{2,}/).map((paragraph, i) => (
        <p key={i}>
          {paragraph.split(/(`[^`]+`|@\w+)/g).map((part, j) => {
            if (part.startsWith('`') && part.endsWith('`')) return <code key={j}>{part.slice(1, -1)}</code>;
            if (part.startsWith('@') && HANDLES.has(part.slice(1)))
              return (
                <span key={j} className="mention">
                  {part}
                </span>
              );
            return <Fragment key={j}>{part}</Fragment>;
          })}
        </p>
      ))}
    </div>
  );
});
