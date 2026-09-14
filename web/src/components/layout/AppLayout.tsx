import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bot, ChevronDown, FileText, Flag, Kanban, Layers, LayoutDashboard, ListTodo, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen,
  Search, Settings, Shield, Sun, User,
} from 'lucide-react';
import NotificationBell from '../notifications/NotificationBell';
import CommandPalette, { usePalette } from '../search/CommandPalette';
import ShortcutsHelp from './ShortcutsHelp';
import CreateRequirementModal from '../requirement/CreateRequirementModal';
import Popover from '../ui/Popover';
import { Avatar } from '../ui/Avatar';
import { ErrorBoundary, Kbd } from '../ui/misc';
import { useSpace, useSpaces } from '../../hooks/useSpaces';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { api } from '../../lib/api';
import type { Space } from '../../lib/api';
import { qk } from '../../lib/queryKeys';

export interface SpaceContext {
  spaceId: string;
  space: Space | undefined;
}

function HealthDot() {
  const { data, isError } = useQuery({
    queryKey: qk.health,
    queryFn: () => api.get<{ api: string; database: string }>('/health'),
    refetchInterval: 60_000,
    retry: false,
  });
  const ok = !isError && data?.database === 'ok';
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]" title={ok ? 'Conectado al servidor' : 'Sin conexión con el servidor'}>
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
      {ok ? 'Conectado' : 'Sin conexión'}
    </span>
  );
}

export default function AppLayout() {
  const { spaceId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: space } = useSpace(spaceId);
  const { data: spaces = [] } = useSpaces();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const { theme, toggleTheme } = useTheme();
  const setPaletteOpen = usePalette((s) => s.setOpen);
  const setOnCreate = usePalette((s) => s.setOnCreate);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('qg_sidebar') === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const canCreate = !!spaceId && space?.my_role !== 'viewer';

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    setOnCreate(canCreate ? () => setCreating(true) : undefined);
  }, [canCreate, setOnCreate]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === 'c' && canCreate && !e.metaKey && !e.ctrlKey && !t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) {
        e.preventDefault();
        setCreating(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canCreate]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem('qg_sidebar', c ? 'expanded' : 'collapsed');
      return !c;
    });
  };

  const nav = (to: string, icon: React.ReactNode, label: string, end = false) => (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
        } ${collapsed ? 'justify-center' : ''}`
      }
    >
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );

  const sidebar = (
    <aside className={`h-full border-r border-[var(--border-color)] bg-[var(--bg-page)] flex flex-col ${collapsed ? 'w-16' : 'w-60'} transition-[width]`}>
      <div className={`flex items-center gap-2 px-3 py-3 ${collapsed ? 'justify-center' : ''}`}>
        <Link to="/" className="h-9 w-9 rounded-xl bg-[var(--accent-color)] flex items-center justify-center shrink-0" aria-label="Inicio">
          <Layers className="h-5 w-5 text-white" />
        </Link>
        {!collapsed && (
          <Popover
            width={260}
            trigger={({ toggle, ref }) => (
              <button ref={ref} type="button" onClick={toggle} className="flex-1 min-w-0 text-left rounded-lg px-2 py-1 hover:bg-[var(--bg-surface-hover)]">
                <span className="block text-sm font-bold text-[var(--text-primary)]">Quagenticus</span>
                <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] truncate">
                  {space ? `${space.key} · ${space.name}` : 'Elegir espacio'}
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </span>
              </button>
            )}
          >
            {(close) => (
              <ul className="py-1 max-h-80 overflow-y-auto">
                {spaces.map((s) => (
                  <li key={s.id}>
                    <button type="button" className={`menu-item ${s.id === spaceId ? 'bg-[var(--accent-soft)]' : ''}`} onClick={() => { close(); navigate(`/spaces/${s.id}/board`); }}>
                      <span className="font-mono text-[10px] text-[var(--accent-text)] w-12 shrink-0">{s.key}</span>
                      <span className="truncate">{s.name}</span>
                    </button>
                  </li>
                ))}
                <li className="border-t border-[var(--border-color)] mt-1 pt-1">
                  <button type="button" className="menu-item" onClick={() => { close(); navigate('/'); }}>Todos los espacios…</button>
                </li>
              </ul>
            )}
          </Popover>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 space-y-4" aria-label="Navegación principal">
        <div className="space-y-0.5">
          {nav('/my-work', <LayoutDashboard className="h-4 w-4 shrink-0" />, 'Mi trabajo')}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            title="Buscar (Ctrl/⌘+K)"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] ${collapsed ? 'justify-center' : ''}`}
          >
            <Search className="h-4 w-4 shrink-0" />
            {!collapsed && <><span>Buscar</span><span className="ml-auto"><Kbd>⌘K</Kbd></span></>}
          </button>
        </div>
        {spaceId && (
          <div className="space-y-0.5">
            {!collapsed && <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{space?.name ?? 'Espacio'}</p>}
            {nav(`/spaces/${spaceId}/board`, <Kanban className="h-4 w-4 shrink-0" />, 'Tablero')}
            {nav(`/spaces/${spaceId}/requirements`, <ListTodo className="h-4 w-4 shrink-0" />, 'Requerimientos')}
            {nav(`/spaces/${spaceId}/docs`, <FileText className="h-4 w-4 shrink-0" />, 'Documentos')}
            {nav(`/spaces/${spaceId}/milestones`, <Flag className="h-4 w-4 shrink-0" />, 'Hitos')}
            {nav(`/spaces/${spaceId}/agents`, <Bot className="h-4 w-4 shrink-0" />, 'Cola de agentes')}
            {nav(`/spaces/${spaceId}/settings`, <Settings className="h-4 w-4 shrink-0" />, 'Configuración')}
          </div>
        )}
        {user?.is_account_admin && <div className="space-y-0.5">{nav('/admin', <Shield className="h-4 w-4 shrink-0" />, 'Administración')}</div>}
      </nav>

      <div className={`p-2 border-t border-[var(--border-color)] space-y-2 ${collapsed ? 'flex flex-col items-center' : ''}`}>
        {!collapsed && <div className="px-2"><HealthDot /></div>}
        <div className={`flex items-center gap-1 ${collapsed ? 'flex-col' : ''}`}>
          <Popover
            width={220}
            trigger={({ toggle, ref }) => (
              <button ref={ref} type="button" onClick={toggle} className="flex items-center gap-2 min-w-0 flex-1 rounded-lg px-2 py-1.5 hover:bg-[var(--bg-surface-hover)]" aria-label="Menú de usuario">
                <Avatar name={user?.display_name} url={user?.avatar_url} size={26} />
                {!collapsed && (
                  <span className="min-w-0 text-left">
                    <span className="block text-xs font-medium text-[var(--text-primary)] truncate">{user?.display_name}</span>
                    <span className="block text-[10px] text-[var(--text-muted)] truncate">@{user?.handle}</span>
                  </span>
                )}
              </button>
            )}
          >
            {(close) => (
              <div className="py-1">
                <button type="button" className="menu-item" onClick={() => { close(); navigate('/profile'); }}><User className="h-3.5 w-3.5" /> Mi perfil</button>
                <button type="button" className="menu-item" onClick={() => { toggleTheme(); close(); }}>
                  {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />} Tema {theme === 'light' ? 'oscuro' : 'claro'}
                </button>
                <button type="button" className="menu-item text-rose-500" onClick={() => { close(); logout(); }}><LogOut className="h-3.5 w-3.5" /> Cerrar sesión</button>
              </div>
            )}
          </Popover>
          <button type="button" onClick={toggleCollapsed} className="icon-btn hidden md:inline-flex" aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen w-full bg-[var(--bg-page)] text-[var(--text-primary)] overflow-hidden">
      <div className="hidden md:block">{sidebar}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-60">{sidebar}</div>
        </div>
      )}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-12 shrink-0 border-b border-[var(--border-color)] flex items-center gap-2 px-3 md:px-5">
          <button type="button" className="icon-btn md:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menú">
            <Menu className="h-5 w-5" />
          </button>
          {space && <span className="px-2 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent-text)] text-xs font-mono">{space.key}</span>}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-2 hidden sm:flex items-center gap-2 w-72 max-w-full px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-xs text-[var(--text-muted)] hover:border-[var(--accent-color)]/50"
          >
            <Search className="h-3.5 w-3.5" /> Buscar o saltar a #123…
            <span className="ml-auto"><Kbd>Ctrl K</Kbd></span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            {canCreate && (
              <button type="button" onClick={() => setCreating(true)} className="btn-primary text-xs py-1" title="Crear requerimiento (C)">
                + Nuevo
              </button>
            )}
            <NotificationBell />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto min-h-0">
          <ErrorBoundary key={location.pathname}>
            <Outlet context={{ spaceId, space } satisfies SpaceContext} />
          </ErrorBoundary>
        </div>
      </main>
      <CommandPalette spaceId={spaceId || undefined} spaceKey={space?.key} />
      <ShortcutsHelp />
      {creating && spaceId && <CreateRequirementModal isOpen onClose={() => setCreating(false)} spaceId={spaceId} />}
    </div>
  );
}
