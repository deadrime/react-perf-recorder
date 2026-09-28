import { useState, type ReactNode } from 'react';

/** A label shown on hover. */
export function Tooltip({ label, disabled, children }: { label: string; disabled?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="tooltip-anchor" onPointerEnter={() => !disabled && setOpen(true)} onPointerLeave={() => setOpen(false)}>
      {children}
      {open && !disabled && (
        <span className="tooltip" role="tooltip">
          {label}
        </span>
      )}
    </span>
  );
}
