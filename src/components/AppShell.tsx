import { NavLink, Outlet, useLocation } from 'react-router';
import { FoldersIcon, GearSixIcon, HouseIcon, ToolboxIcon, type Icon } from '@phosphor-icons/react';
import { useWorkspace } from '@/store/workspace';
import { useDesktop } from '@/lib/hooks';
import { GROUPS, TOOLS } from '@/tools/registry';
import { cx } from './ui';
import { Logo } from './Logo';

function NavItem({ to, icon: I, label, badge, end }: { to: string; icon: Icon; label: string; badge?: number; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      viewTransition
      className={({ isActive }) =>
        cx('flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors', isActive ? 'bg-accent-soft font-medium text-accent' : 'text-fg hover:bg-surface-2')
      }
    >
      {({ isActive }) => (
        <>
          <I size={18} weight={isActive ? 'fill' : 'regular'} />
          <span className="flex-1 truncate">{label}</span>
          {!!badge && <span className="rounded-full bg-surface-3 px-1.5 text-[11px] font-semibold tabular-nums text-fg">{badge}</span>}
        </>
      )}
    </NavLink>
  );
}

function Sidebar() {
  const count = useWorkspace((s) => s.items.length);
  return (
    <aside className="scroll-thin flex h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface">
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <Logo />
      </div>
      <nav className="space-y-0.5 px-2" aria-label="Utama">
        <NavItem to="/" end icon={HouseIcon} label="Beranda" />
        <NavItem to="/berkas" icon={FoldersIcon} label="Berkas" badge={count} />
      </nav>
      <nav className="mt-3 flex-1 space-y-4 px-2 pb-4" aria-label="Alat">
        {GROUPS.map((g) => (
          <div key={g.id}>
            <p className="px-2.5 pb-1 text-[11px] font-semibold text-faint">{g.label}</p>
            <div className="space-y-0.5">
              {TOOLS.filter((t) => t.group === g.id).map((t) => (
                <NavItem key={t.id} to={`/t/${t.id}`} icon={t.icon} label={t.name} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-2">
        <NavItem to="/pengaturan" icon={GearSixIcon} label="Pengaturan" />
      </div>
    </aside>
  );
}

function BottomNav() {
  const count = useWorkspace((s) => s.items.length);
  const tabs: { to: string; icon: Icon; label: string; end?: boolean; badge?: number }[] = [
    { to: '/', icon: HouseIcon, label: 'Beranda', end: true },
    { to: '/alat', icon: ToolboxIcon, label: 'Alat' },
    { to: '/berkas', icon: FoldersIcon, label: 'Berkas', badge: count },
    { to: '/pengaturan', icon: GearSixIcon, label: 'Setelan' },
  ];
  return (
    <nav aria-label="Navigasi" className="z-30 shrink-0 border-t border-line bg-surface/95 pb-[var(--safe-bottom)] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-lg items-stretch">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} viewTransition className="flex flex-1 flex-col items-center justify-center gap-0.5">
            {({ isActive }) => (
              <>
                <span className={cx('relative flex h-8 w-14 items-center justify-center rounded-full transition-colors', isActive ? 'bg-accent-soft text-accent' : 'text-muted')}>
                  <t.icon size={22} weight={isActive ? 'fill' : 'regular'} />
                  {!!t.badge && (
                    <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-[18px] text-accent-fg">
                      {t.badge > 99 ? '99+' : t.badge}
                    </span>
                  )}
                </span>
                <span className={cx('text-[11px]', isActive ? 'font-semibold text-fg' : 'text-muted')}>{t.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function AppShell() {
  const desktop = useDesktop();
  const { pathname } = useLocation();
  const inTool = pathname.startsWith('/t/');
  if (desktop) {
    return (
      <div className="flex h-dvh">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    );
  }
  return (
    <div className="flex h-dvh flex-col">
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
      {!inTool && <BottomNav />}
    </div>
  );
}

export function Page({ title, children, actions, wide }: { title: string; children: React.ReactNode; actions?: React.ReactNode; wide?: boolean }) {
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <header className="pt-safe sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className={cx('mx-auto flex h-14 items-center gap-2 px-4', wide ? 'max-w-6xl' : 'max-w-3xl')}>
          <h1 className="min-w-0 flex-1 truncate text-[19px] font-semibold">{title}</h1>
          {actions}
        </div>
      </header>
      <div className={cx('mx-auto px-4 pb-10 pt-4', wide ? 'max-w-6xl' : 'max-w-3xl')}>{children}</div>
    </div>
  );
}
