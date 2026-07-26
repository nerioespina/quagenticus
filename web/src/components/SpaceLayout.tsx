import { useState } from 'react';
import { Link, NavLink, useParams, Outlet } from 'react-router-dom';
import { Layers, Kanban, ListTodo, FileText, Bot, Search, LogOut, Database, Cpu, Terminal } from 'lucide-react';
import { useSpace } from '../hooks/useSpaces';
import { useAuth } from '../lib/auth';

export default function SpaceLayout() {
  const { spaceId = '' } = useParams();
  const { data: space } = useSpace(spaceId);
  const user = useAuth(s => s.user);
  const logout = useAuth(s => s.logout);
  const [search, setSearch] = useState('');

  const navItem = (to: string, icon: React.ReactNode, label: string) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
          isActive
            ? 'bg-gradient-to-r from-indigo-600/20 to-violet-600/10 text-indigo-300 border border-indigo-500/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
        }`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800/80 bg-slate-950/60 backdrop-blur-xl flex flex-col justify-between p-4">
        <div>
          <Link to="/" className="flex items-center gap-3 px-2 py-3 mb-6 group">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold tracking-tight text-lg bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
                Quagenticus
              </h1>
              {space && (
                <p className="text-xs text-slate-400 font-mono">{space.key} · {space.name}</p>
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
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-300">
              <span className="flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-emerald-400" />
                PostgreSQL 16
              </span>
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Online
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-300">
              <span className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-indigo-400" />
                Go REST API
              </span>
              <span className="text-slate-400 font-mono">:8080</span>
            </div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-300">
              <span className="flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-violet-400" />
                MCP Server
              </span>
              <span className="text-slate-400 font-mono">próximo</span>
            </div>
          </div>

          {user && (
            <div className="flex items-center justify-between p-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-xs font-bold">
                  {user.display_name.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-xs text-slate-300 truncate max-w-[120px]">{user.display_name}</span>
              </div>
              <button onClick={logout} className="p-1.5 rounded-md hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900/40 to-slate-950">
        <header className="h-14 border-b border-slate-800/80 bg-slate-950/40 backdrop-blur-md flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            {space && (
              <span className="px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-mono font-medium">
                {space.key}
              </span>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-slate-900/80 border border-slate-800 rounded-lg pl-9 pr-4 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 w-56 transition-all"
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
