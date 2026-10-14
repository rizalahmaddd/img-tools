import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { Sheet } from './Sheet';
import { GROUPS, searchTools, type ToolMeta } from '@/tools/registry';
import { cx } from './ui';

export function ToolTile({ tool, active, compact, onClick }: { tool: ToolMeta; active?: boolean; compact?: boolean; onClick?: () => void }) {
  const Icon = tool.icon;
  return (
    <Link
      to={`/t/${tool.id}`}
      viewTransition
      onClick={onClick}
      className={cx(
        'group flex items-center gap-3 rounded-md transition-colors',
        compact ? 'p-2.5' : 'p-3',
        active ? 'bg-accent-soft' : 'hover:bg-surface-2 active:bg-surface-3',
      )}
    >
      <span className={cx('flex shrink-0 items-center justify-center rounded-md', compact ? 'size-9' : 'size-10', active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg group-hover:bg-surface')}>
        <Icon size={compact ? 19 : 21} weight={active ? 'fill' : 'regular'} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{tool.name}</span>
        <span className="block truncate text-xs text-muted">{tool.desc}</span>
      </span>
    </Link>
  );
}

export function ToolGrid({ query = '', current, onPick, columns = 'sm:grid-cols-2 xl:grid-cols-3' }: { query?: string; current?: string; onPick?: () => void; columns?: string }) {
  const list = searchTools(query);
  if (!list.length) return <p className="px-2 py-8 text-center text-sm text-muted">Tidak ada alat untuk “{query}”.</p>;
  return (
    <div className="space-y-5">
      {GROUPS.map((g) => {
        const tools = list.filter((t) => t.group === g.id);
        if (!tools.length) return null;
        return (
          <section key={g.id}>
            <h3 className="mb-1.5 px-2 text-xs font-semibold text-muted">{g.label}</h3>
            <div className={cx('grid gap-0.5', columns)}>
              {tools.map((t) => (
                <ToolTile key={t.id} tool={t} active={t.id === current} onClick={onPick} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function SearchBox({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const navigate = useNavigate();
  return (
    <label className="flex h-11 items-center gap-2 rounded-md border border-line bg-surface px-3 focus-within:border-accent">
      <MagnifyingGlassIcon size={18} className="shrink-0 text-muted" />
      <input
        autoFocus={autoFocus}
        type="search"
        enterKeyHint="go"
        placeholder="Cari alat, mis. kompres, pdf, blur"
        aria-label="Cari alat"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const first = searchTools(value)[0];
            if (first) navigate(`/t/${first.id}`);
          }
        }}
      />
    </label>
  );
}

export function ToolPicker({ open, onClose, current }: { open: boolean; onClose: () => void; current?: string }) {
  const [q, setQ] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title="Lanjut ke alat lain" wide>
      <div className="space-y-4 px-3 pb-5">
        <p className="px-1 text-[13px] text-muted">Gambar yang sedang dibuka ikut terbawa, termasuk hasil editnya.</p>
        <SearchBox value={q} onChange={setQ} />
        <ToolGrid query={q} current={current} onPick={onClose} columns="grid-cols-1 sm:grid-cols-2" />
      </div>
    </Sheet>
  );
}
