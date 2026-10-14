import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { CaretDownIcon, CheckIcon, SpinnerGapIcon, type Icon } from '@phosphor-icons/react';
import { haptic } from '@/lib/device';

export function cx(...v: (string | false | null | undefined)[]) {
  return v.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: Icon;
  iconRight?: Icon;
  loading?: boolean;
  block?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95 disabled:opacity-45',
  secondary: 'bg-surface-2 text-fg hover:bg-surface-3 disabled:opacity-45',
  outline: 'border border-line-strong text-fg hover:bg-surface-2 disabled:opacity-45',
  ghost: 'text-fg hover:bg-surface-2 disabled:opacity-40',
  danger: 'bg-surface-2 text-danger hover:bg-surface-3 disabled:opacity-45',
};

const sizes = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-md',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-lg font-semibold',
};

export function Button({ variant = 'secondary', size = 'md', icon: I, iconRight: IR, loading, block, className, children, onClick, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex min-w-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background,filter,opacity] duration-150',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      onClick={(e) => {
        if (variant === 'primary') haptic('light');
        onClick?.(e);
      }}
      {...rest}
    >
      {loading ? <SpinnerGapIcon className="animate-spin" size={size === 'sm' ? 15 : 18} /> : I && <I size={size === 'sm' ? 15 : 18} weight={variant === 'primary' ? 'bold' : 'regular'} />}
      {children != null && children !== false && <span className="min-w-0 truncate">{children}</span>}
      {IR && <IR size={size === 'sm' ? 14 : 16} />}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: Icon;
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
  weight?: 'regular' | 'bold' | 'fill';
}

export function IconButton({ icon: I, label, active, size = 'md', className, weight, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-35',
        size === 'sm' ? 'size-8' : 'size-10',
        active ? 'bg-accent-soft text-accent' : 'text-fg hover:bg-surface-2',
        className,
      )}
      {...rest}
    >
      <I size={size === 'sm' ? 17 : 20} weight={weight ?? (active ? 'fill' : 'regular')} />
    </button>
  );
}

export function Field({ label, hint, children, right, htmlFor }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; right?: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      {(label || right) && (
        <div className="flex min-h-5 items-center justify-between gap-2">
          {label && (
            <label htmlFor={htmlFor} className="text-[13px] font-medium text-muted">
              {label}
            </label>
          )}
          {right}
        </div>
      )}
      {children}
      {hint && <p className="text-xs leading-snug text-muted">{hint}</p>}
    </div>
  );
}

export function Section({ title, children, action, defaultOpen = true, collapsible = false }: { title: string; children: ReactNode; action?: ReactNode; defaultOpen?: boolean; collapsible?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-line px-4 py-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        {collapsible ? (
          <button type="button" className="flex items-center gap-1.5 text-sm font-semibold" onClick={() => setOpen(!open)} aria-expanded={open}>
            <CaretDownIcon size={14} className={cx('transition-transform', !open && '-rotate-90')} />
            {title}
          </button>
        ) : (
          <h3 className="text-sm font-semibold">{title}</h3>
        )}
        {action}
      </div>
      {(!collapsible || open) && <div className="space-y-4">{children}</div>}
    </section>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  defaultValue?: number;
  format?: (v: number) => string;
  hint?: ReactNode;
  disabled?: boolean;
}

export function Slider({ label, value, min, max, step = 1, unit = '', onChange, defaultValue, format, hint, disabled }: SliderProps) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const fill = ((value - min) / (max - min)) * 100;
  const shown = format ? format(value) : `${Number.isInteger(step) ? Math.round(value) : value.toFixed(1)}${unit}`;
  const commitDraft = () => {
    const n = parseFloat(draft.replace(',', '.'));
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    setEditing(false);
  };
  return (
    <div className={cx('space-y-0.5', disabled && 'pointer-events-none opacity-45')}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-muted" onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}>
          {label}
        </label>
        {editing ? (
          <input
            autoFocus
            inputMode="decimal"
            className="h-6 w-16 rounded-sm border border-line-strong bg-surface px-1.5 text-right text-[13px] tabular-nums"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="h-6 rounded-sm px-1.5 text-[13px] tabular-nums text-fg hover:bg-surface-2"
            onClick={() => {
              setDraft(String(value));
              setEditing(true);
            }}
            aria-label={`Ubah nilai ${label}`}
          >
            {shown}
          </button>
        )}
      </div>
      <input
        id={id}
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--fill' as string]: `${fill}%` }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
      />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export interface SegOption<T extends string | number> {
  value: T;
  label: ReactNode;
  icon?: Icon;
  title?: string;
}

export function Segmented<T extends string | number>({ value, options, onChange, size = 'md', label }: { value: T; options: SegOption<T>[]; onChange: (v: T) => void; size?: 'sm' | 'md'; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-md bg-surface-2 p-1">
      {options.map((o) => {
        const active = o.value === value;
        const I = o.icon;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => {
              haptic('light');
              onChange(o.value);
            }}
            className={cx(
              'inline-flex min-w-fit flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium transition-colors',
              size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-2.5 text-[13px]',
              active ? 'bg-surface text-fg shadow-[0_1px_2px_rgb(0_0_0/0.12)]' : 'text-muted hover:text-fg',
            )}
          >
            {I && <I size={15} weight={active ? 'bold' : 'regular'} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={cx('flex items-start justify-between gap-3', disabled && 'opacity-45')}>
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-sm">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-snug text-muted">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => {
          haptic('light');
          onChange(!checked);
        }}
        className={cx('relative mt-0.5 h-[26px] w-[44px] shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3')}
      >
        <span className={cx('absolute left-0 top-[3px] size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[21px]' : 'translate-x-[3px]')} />
      </button>
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options, id, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; id?: string; label?: string }) {
  return (
    <div className="relative">
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-10 w-full appearance-none rounded-md border border-line bg-surface px-3 pr-9 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <CaretDownIcon size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function NumberInput({ value, onChange, min, max, step = 1, unit, id, label, placeholder, allowEmpty }: { value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; unit?: string; id?: string; label?: string; placeholder?: string; allowEmpty?: boolean }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value == null ? '' : String(value));
  }, [value]);
  const commit = (raw: string) => {
    if (raw.trim() === '') {
      if (allowEmpty) onChange(null);
      else setDraft(value == null ? '' : String(value));
      return;
    }
    let n = parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(n)) return setDraft(value == null ? '' : String(value));
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    onChange(n);
  };
  return (
    <div className="flex h-10 min-w-0 items-center rounded-md border border-line bg-surface focus-within:border-accent">
      <input
        id={id}
        aria-label={label}
        inputMode="decimal"
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm tabular-nums outline-none"
        value={draft}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parseFloat(e.target.value.replace(',', '.'));
          if (Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n);
        }}
        onBlur={(e) => {
          focused.current = false;
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const n = (value ?? 0) + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1);
            commit(String(n));
          }
        }}
      />
      {unit && <span className="pr-3 text-xs text-muted">{unit}</span>}
    </div>
  );
}

export function TextInput({ value, onChange, placeholder, id, label, multiline }: { value: string; onChange: (v: string) => void; placeholder?: string; id?: string; label?: string; multiline?: boolean }) {
  const cls = 'w-full rounded-md border border-line bg-surface px-3 text-sm outline-none focus:border-accent';
  return multiline ? (
    <textarea id={id} aria-label={label} rows={2} placeholder={placeholder} className={cx(cls, 'resize-y py-2')} value={value} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input id={id} aria-label={label} placeholder={placeholder} className={cx(cls, 'h-10')} value={value} onChange={(e) => onChange(e.target.value)} />
  );
}

const SWATCHES = ['#ffffff', '#000000', '#f4f3f1', '#1f2937', '#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#ec4899', 'transparent'];

export function ColorInput({ value, onChange, allowTransparent, label }: { value: string; onChange: (v: string) => void; allowTransparent?: boolean; label?: string }) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  const swatches = allowTransparent ? SWATCHES : SWATCHES.filter((s) => s !== 'transparent');
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="relative size-10 shrink-0 overflow-hidden rounded-md border border-line-strong" aria-label={label ?? 'Pilih warna'}>
          <span className={cx('absolute inset-0', value === 'transparent' && 'checker')} style={value !== 'transparent' ? { background: value } : undefined} />
          <input type="color" className="absolute inset-0 size-full cursor-pointer opacity-0" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} />
        </label>
        <input
          aria-label="Kode warna hex"
          className="h-10 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 font-mono text-sm uppercase outline-none focus:border-accent"
          value={hex}
          onChange={(e) => {
            setHex(e.target.value);
            const v = e.target.value.trim();
            if (/^#?[0-9a-f]{6}$/i.test(v)) onChange(v.startsWith('#') ? v : `#${v}`);
            if (/^#?[0-9a-f]{3}$/i.test(v)) {
              const s = v.replace('#', '');
              onChange(`#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`);
            }
          }}
          onBlur={() => setHex(value)}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {swatches.map((s) => (
          <button
            key={s}
            type="button"
            aria-label={s === 'transparent' ? 'Transparan' : s}
            onClick={() => onChange(s)}
            className={cx('size-7 rounded-full border', s === value ? 'border-accent ring-2 ring-accent/40' : 'border-line-strong', s === 'transparent' && 'checker')}
            style={s !== 'transparent' ? { background: s } : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export function Progress({ value, className }: { value?: number; className?: string }) {
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-surface-3', className)} role="progressbar" aria-valuenow={value != null ? Math.round(value * 100) : undefined} aria-valuemin={0} aria-valuemax={100}>
      {value == null ? (
        <div className="h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-accent" />
      ) : (
        <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${Math.max(2, value * 100)}%` }} />
      )}
    </div>
  );
}

export function Chip({ active, onClick, children, icon: I }: { active?: boolean; onClick?: () => void; children: ReactNode; icon?: Icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
        active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-fg hover:bg-surface-2',
      )}
    >
      {I && <I size={15} />}
      {children}
      {active && <CheckIcon size={13} weight="bold" />}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>;
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  return (
    <div
      className={cx(
        'rounded-md px-3 py-2.5 text-[13px] leading-snug',
        kind === 'info' && 'bg-surface-2 text-muted',
        kind === 'warn' && 'bg-warn/12 text-warn',
        kind === 'error' && 'bg-danger/12 text-danger',
      )}
    >
      {children}
    </div>
  );
}
