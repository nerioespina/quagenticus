import { useState } from 'react';
import { Link, NavLink, useParams, Outlet } from 'react-router-dom';
import { Layers, Kanban, ListTodo, FileText, Bot, Search, LogOut, Database, Cpu, Terminal, Sun, Moon } from 'lucide-react';
import { useSpace } from '../hooks/useSpaces';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';

export default function SpaceLayout() {
  const { spaceId = '' } = useParams();
  const { data: space } = useSpace(spaceId);
  const user = useAuth(s => s.user);
  const logout = useAuth(s => s.logout);
  const { theme, toggleTheme } = useTheme();
  const [search, setSearch] = useState('');

  const navItem = (to: string, icon: React.ReactNode, label: string) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
          isActive
            ? 'bg-[var(--accent-soft)] text-[var(--accent-text)] border border-[var(--accent-color)]/30'
            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
        }`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );

  return (
    <div className="flex h-screen w-full bg-[var(--bg-page)] text-[var(--text-primary)] overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[var(--border-color)] bg-[var(--bg-page)] backdrop-blur-xl flex flex-col justify-between p-4">
        <div>
          <Link to="/" className="flex items-center gap-3 px-2 py-3 mb-6 group">
            <div className="h-10 w-10 rounded-xl bg-[var(--accent-color)] flex items-center justify-center shadow-[var(--shadow-md)]">
              <Layers className="h-5 w-5 text-[var(--text-inverted)]" />
            </div>
            <div>
              <h1 className="font-bold tracking-tight text-lg text-[var(--text-primary)]">
                Quagenticus
              </h1>
              {space && (
                <p className="text-xs text-[var(--text-muted)] font-mono">{space.key} · {space.name}</p>
              )}
            </div>
          </Link>

          <nav className="space-y-1">
            {navItem(`/spaces/${spaceId}/board`, <Kanban className="h-4 w-4" />, 'Tablero Kanban')}
            {navItem(`/spaces/${spaceId}/requirements`, <ListTodo className="h-4 w-4" />, 'Requerimientos')}
            {navItem(`/spaces/${spaceId}/docs`, <FileText className="h-4 w-4" />, 'Documentos')}
            {navItem(`/spaces/${spaceId}/agents`, <Bot className="h-4 w-4" />, 'Cola de Agentes')}
          </nav>
        </div>

        {/* Status bar */}
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-[var(--bg-surface)]/80 border border-[var(--border-color)] space-y-2.5">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-emerald-500" />
                PostgreSQL 16
              </span>
              <span className="flex items-center gap-1 text-emerald-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Online
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-indigo-500" />
                Go REST API
              </span>
              <span className="text-[var(--text-muted)] font-mono">:8080</span>
            </div>
            <div className="flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-violet-500" />
                MCP Server
              </span>
              <span className="text-[var(--text-muted)] font-mono">próximo</span>
            </div>
          </div>

          {user && (
            <div className="flex items-center justify-between p-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-[var(--accent-color)] flex items-center justify-center text-xs font-bold text-[var(--text-inverted)]">
                  {user.display_name.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-xs text-[var(--text-secondary)] truncate max-w-[120px]">{user.display_name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleTheme}
                  title="Cambiar tema (claro/oscuro)"
                  className="p-1.5 rounded-md hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </button>
                <button onClick={logout} className="p-1.5 rounded-md hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[var(--bg-page)]">
        <header className="h-14 border-b border-[var(--border-color)] bg-[var(--bg-page)]/70 backdrop-blur-md flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            {space && (
              <span className="px-2.5 py-1 rounded-md bg-[var(--accent-soft)] border border-[var(--accent-color)]/20 text-[var(--accent-text)] text-xs font-mono font-medium">
                {space.key}
              </span>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Buscar…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg pl-9 pr-4 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-color)]/50 w-56 transition-all"
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <Outlet context={{ spaceId, search }} />
        </div>
      </main>
    </div>
  );
}
