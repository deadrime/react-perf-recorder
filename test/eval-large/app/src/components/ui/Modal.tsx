import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useHotkey } from '../../hooks/useHotkey';

export function Modal({ onClose, children, label, className }: { onClose(): void; children: ReactNode; label: string; className?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  useHotkey('escape', onClose);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();
    return () => previous?.focus();
  }, []);
  return createPortal(
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={className ?? 'modal'} role="dialog" aria-label={label} ref={panel}>
        {children}
      </div>
    </div>,
    document.body
  );
}
