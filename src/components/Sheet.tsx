import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { XIcon } from '@phosphor-icons/react';
import { IconButton, cx } from './ui';
import { useMedia } from '@/lib/hooks';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Sheet({ open, onClose, title, children, footer, wide }: SheetProps) {
  const desktop = useMedia('(min-width: 768px)');
  const ref = useRef<HTMLDivElement>(null);
  const drag = useDragControls();
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement;
    const t = setTimeout(() => ref.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      prevFocus.current?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
          <motion.div
            className="absolute inset-0 bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            tabIndex={-1}
            className={cx(
              'relative flex max-h-[92dvh] w-full flex-col bg-surface outline-none md:max-h-[85dvh] md:rounded-lg',
              'rounded-t-[20px] shadow-[var(--shadow-pop)]',
              wide ? 'md:max-w-2xl' : 'md:max-w-md',
            )}
            initial={desktop ? { opacity: 0, scale: 0.97 } : { y: '100%' }}
            animate={desktop ? { opacity: 1, scale: 1 } : { y: 0 }}
            exit={desktop ? { opacity: 0, scale: 0.97 } : { y: '100%' }}
            transition={desktop ? { duration: 0.16 } : { type: 'spring', damping: 32, stiffness: 380 }}
            drag={desktop ? false : 'y'}
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
          >
            {!desktop && (
              <div className="flex shrink-0 touch-none justify-center pb-1 pt-2.5" onPointerDown={(e) => drag.start(e)}>
                <span className="h-1 w-10 rounded-full bg-line-strong" />
              </div>
            )}
            {title && (
              <div className="flex shrink-0 touch-none items-center justify-between gap-2 px-4 pb-2 pt-1 md:pt-4" onPointerDown={(e) => !desktop && drag.start(e)}>
                <h2 className="text-base font-semibold">{title}</h2>
                <IconButton icon={XIcon} label="Tutup" size="sm" onClick={onClose} />
              </div>
            )}
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
            {footer && <div className="shrink-0 border-t border-line px-4 pt-3 pb-[max(12px,var(--safe-bottom))] md:pb-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Confirm({ open, onClose, onConfirm, title, body, confirmLabel = 'Ya', danger }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <button type="button" className="h-11 flex-1 rounded-md bg-surface-2 text-sm font-medium" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className={cx('h-11 flex-1 rounded-md text-sm font-semibold', danger ? 'bg-danger text-white' : 'bg-accent text-accent-fg')}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      {body && <div className="px-4 pb-4 text-sm text-muted">{body}</div>}
    </Sheet>
  );
}
