import { AnimatePresence, motion } from 'motion/react';
import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon, XIcon } from '@phosphor-icons/react';
import { useUi } from '@/store/ui';
import { Progress, cx } from './ui';

const ICONS = { info: InfoIcon, success: CheckCircleIcon, error: XCircleIcon, warn: WarningIcon };
const TONE = { info: 'text-muted', success: 'text-ok', error: 'text-danger', warn: 'text-warn' };

export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismiss);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-3 pt-[calc(var(--safe-top)+10px)] md:left-auto md:right-4 md:top-16 md:items-end md:pt-0">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const I = ICONS[t.kind];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              onDragEnd={(_, i) => Math.abs(i.offset.x) > 80 && dismiss(t.id)}
              className="pointer-events-auto w-full max-w-sm rounded-lg border border-line bg-surface p-3 shadow-[var(--shadow-pop)]"
              role={t.kind === 'error' ? 'alert' : 'status'}
            >
              <div className="flex items-start gap-2.5">
                <I size={20} weight="fill" className={cx('mt-px shrink-0', TONE[t.kind])} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t.title}</p>
                  {t.body && <p className="mt-0.5 whitespace-pre-line text-[13px] leading-snug text-muted">{t.body}</p>}
                  {!!t.actions?.length && (
                    <div className="mt-2 flex gap-2">
                      {t.actions.map((a) => (
                        <button
                          key={a.label}
                          type="button"
                          className="h-8 rounded-md bg-surface-2 px-3 text-[13px] font-medium hover:bg-surface-3"
                          onClick={() => {
                            a.run();
                            dismiss(t.id);
                          }}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" aria-label="Tutup" className="-m-1 rounded-sm p-1 text-muted hover:text-fg" onClick={() => dismiss(t.id)}>
                  <XIcon size={16} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function TaskBar() {
  const tasks = useUi((s) => s.tasks);
  const t = tasks[tasks.length - 1];
  return (
    <AnimatePresence>
      {t && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="fixed inset-x-3 bottom-[calc(var(--safe-bottom)+88px)] z-[65] mx-auto max-w-sm rounded-lg border border-line bg-surface p-3 shadow-[var(--shadow-pop)] md:bottom-6 md:left-1/2 md:right-auto md:w-96 md:-translate-x-1/2"
          role="status"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {t.label}
                {t.total > 1 && (
                  <span className="ml-1.5 tabular-nums text-muted">
                    {t.done}/{t.total}
                  </span>
                )}
              </p>
              {t.detail && <p className="truncate text-xs text-muted">{t.detail}</p>}
            </div>
            {t.cancel && (
              <button type="button" onClick={t.cancel} className="h-8 shrink-0 rounded-md bg-surface-2 px-3 text-[13px] font-medium hover:bg-surface-3">
                Batal
              </button>
            )}
          </div>
          <Progress value={t.progress != null ? (t.total > 1 ? (t.done + t.progress) / t.total : t.progress) : t.total > 1 ? t.done / t.total : undefined} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
