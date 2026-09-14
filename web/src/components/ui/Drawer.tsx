import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  header?: React.ReactNode;
  width?: string;
  label: string;
}

/** Side panel over the current page (quick card panel). */
export default function Drawer({ isOpen, onClose, children, header, width = 'max-w-2xl', label }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-[var(--overlay-scrim)]/40" onClick={onClose} aria-hidden="true" />
      <aside
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-label={label}
        className={`relative h-full w-full ${width} bg-[var(--bg-page)] border-l border-[var(--border-color)] shadow-[var(--shadow-md)] flex flex-col outline-none animate-[slidein_.18s_ease-out]`}
      >
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--border-color)] shrink-0">
          <div className="flex-1 min-w-0">{header}</div>
          <button type="button" onClick={onClose} aria-label="Cerrar panel" className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
