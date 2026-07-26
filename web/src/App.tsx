import { useState } from 'react';
import {
  FileText,
  Kanban,
  ListTodo,
  Bot,
  Search,
  CheckCircle2,
  Terminal,
  Database,
  Cpu,
  Layers
} from 'lucide-react';

// Mocked initial requirements data
const initialRequirements = [
  {
    ref: 'QG-142',
    title: 'Exportar informes a PDF desde pipelines de agentes',
    tracker: 'feature',
    status: 'ready',
    priority: 'high',
    dorScore: 100,
    assignee: 'María Ruiz',
    agent: 'Claude-3.5-Sonnet',
    spentHours: 4.5,
    labels: ['mcp', 'reportes', 'ui']
  },
  {
    ref: 'QG-108',
    title: 'Integración OAuth 2.1 con DCR para servidores MCP externos',
    tracker: 'security',
    status: 'in_progress',
    priority: 'urgent',
    dorScore: 95,
    assignee: 'Carlos Mendoza',
    agent: 'Quagenticus-Worker-01',
    spentHours: 12.0,
    labels: ['oauth', 'seguridad', 'auth']
  },
  {
    ref: 'QG-115',
    title: 'Sincronización fraccionaria de board_position en PostgreSQL 16',
    tracker: 'task',
    status: 'in_analysis',
    priority: 'normal',
    dorScore: 80,
    assignee: 'Sofía Álvarez',
    agent: 'Gemini-1.5-Pro',
    spentHours: 2.0,
    labels: ['postgres', 'kanban', 'sql']
  },
  {
    ref: 'QG-099',
    title: 'Editor CodeMirror 6 con autocompletado de wikilinks [[ ... ]]',
    tracker: 'feature',
    status: 'ready',
    priority: 'high',
    dorScore: 90,
    assignee: 'Ana Torres',
    agent: null,
    spentHours: 0.0,
    labels: ['frontend', 'editor']
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'marknote' | 'redmine' | 'trello' | 'agents'>('trello');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReq, setSelectedReq] = useState(initialRequirements[0]);

  const filteredReqs = initialRequirements.filter(r =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.ref.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-800/80 bg-slate-950/60 backdrop-blur-xl flex flex-col justify-between p-4">
        <div>
          {/* Logo & Branding */}
          <div className="flex items-center gap-3 px-2 py-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold tracking-tight text-lg bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
                Quagenticus
              </h1>
              <p className="text-xs text-slate-400 font-mono">v0.1.0-alpha · PL/pgSQL</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('trello')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'trello'
                  ? 'bg-gradient-to-r from-indigo-600/20 to-violet-600/10 text-indigo-300 border border-indigo-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Kanban className="h-4 w-4" />
              <span>Tablero Kanban (F2b)</span>
            </button>

            <button
              onClick={() => setActiveTab('redmine')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'redmine'
                  ? 'bg-gradient-to-r from-indigo-600/20 to-violet-600/10 text-indigo-300 border border-indigo-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <ListTodo className="h-4 w-4" />
              <span>Requerimientos (F2)</span>
            </button>

            <button
              onClick={() => setActiveTab('marknote')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'marknote'
                  ? 'bg-gradient-to-r from-indigo-600/20 to-violet-600/10 text-indigo-300 border border-indigo-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>Marknote Docs (F1)</span>
            </button>

            <button
              onClick={() => setActiveTab('agents')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'agents'
                  ? 'bg-gradient-to-r from-indigo-600/20 to-violet-600/10 text-indigo-300 border border-indigo-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Bot className="h-4 w-4" />
              <span>Cola de Agentes (F3-F4)</span>
              <span className="ml-auto px-1.5 py-0.5 text-[10px] font-mono bg-indigo-500/20 text-indigo-300 rounded-full">
                3 ON
              </span>
            </button>
          </nav>
        </div>

        {/* System Diagnostics Status */}
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-300">
            <span className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-emerald-400" />
              PostgreSQL 16
            </span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Online
            </span>
          </div>
          <div className="flex items-center justify-between text-xs font-medium text-slate-300">
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-indigo-400" />
              Go REST API
            </span>
            <span className="text-slate-400 font-mono">:18080</span>
          </div>
          <div className="flex items-center justify-between text-xs font-medium text-slate-300">
            <span className="flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-violet-400" />
              MCP Server
            </span>
            <span className="text-slate-400 font-mono">:18081</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900/40 to-slate-950">
        {/* Top Header */}
        <header className="h-16 border-b border-slate-800/80 bg-slate-950/40 backdrop-blur-md flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-300">Espacio activo:</span>
            <span className="px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-mono font-medium">
              QG // NUCLEO PRINCIPAL
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por QG-123 o título (FTS)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-slate-900/80 border border-slate-800 rounded-lg pl-9 pr-4 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 w-72 transition-all"
              />
            </div>

            <div className="flex items-center gap-2 border-l border-slate-800 pl-4">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center font-bold text-xs shadow-md">
                NE
              </div>
              <div className="text-xs">
                <p className="font-medium text-slate-200">Nerio Espina</p>
                <p className="text-slate-400">Arquitecto</p>
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Views */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'trello' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-100">Tablero Kanban del Espacio</h2>
                  <p className="text-sm text-slate-400">
                    Posicionamiento fraccionario en BD · Movimiento optimista con control de DoR
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
                    WIP Límite: <strong className="text-indigo-400">4 / Columna</strong>
                  </span>
                </div>
              </div>

              {/* Kanban Columns */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  { title: 'En Análisis (DoR Check)', status: 'in_analysis', color: 'border-amber-500/30' },
                  { title: 'Listo (Ready para Agente)', status: 'ready', color: 'border-indigo-500/30' },
                  { title: 'En Desarrollo (Claimed)', status: 'in_progress', color: 'border-violet-500/30' },
                  { title: 'Resuelto / Verificación', status: 'resolved', color: 'border-emerald-500/30' }
                ].map(col => (
                  <div
                    key={col.status}
                    className={`bg-slate-900/50 border ${col.color} rounded-xl p-4 flex flex-col gap-3 min-h-[480px]`}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                      <span className="text-sm font-semibold text-slate-200">{col.title}</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                        {filteredReqs.filter(r => r.status === col.status).length}
                      </span>
                    </div>

                    {filteredReqs
                      .filter(r => r.status === col.status)
                      .map(req => (
                        <div
                          key={req.ref}
                          onClick={() => setSelectedReq(req)}
                          className="bg-slate-900 border border-slate-800/80 hover:border-indigo-500/40 rounded-xl p-3.5 space-y-3 cursor-pointer transition-all shadow-sm hover:shadow-indigo-500/5 group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-semibold text-indigo-400 group-hover:text-indigo-300">
                              {req.ref}
                            </span>
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded uppercase tracking-wider bg-slate-800 text-slate-300">
                              {req.priority}
                            </span>
                          </div>

                          <p className="text-sm text-slate-200 font-medium leading-snug">
                            {req.title}
                          </p>

                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {req.labels.map(l => (
                              <span
                                key={l}
                                className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-800/80 text-slate-400 border border-slate-700/50"
                              >
                                #{l}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs text-slate-400">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                              <span>DoR {req.dorScore}%</span>
                            </div>
                            {req.agent && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 text-[11px]">
                                <Bot className="h-3 w-3" />
                                {req.agent}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'redmine' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-100">Bandeja de Requerimientos (Estilo Redmine)</h2>
                  <p className="text-sm text-slate-400">
                    Filtros guardados, transiciones de estado e inspección canónica
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/80 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Ref</th>
                      <th className="py-3 px-4">Tracker</th>
                      <th className="py-3 px-4">Título</th>
                      <th className="py-3 px-4">Estado</th>
                      <th className="py-3 px-4">Definition of Ready</th>
                      <th className="py-3 px-4">Agente Asignado</th>
                      <th className="py-3 px-4">Tiempo (h)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-sm">
                    {filteredReqs.map(r => (
                      <tr
                        key={r.ref}
                        onClick={() => setSelectedReq(r)}
                        className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-indigo-400">{r.ref}</td>
                        <td className="py-3 px-4 uppercase text-xs font-mono text-slate-400">{r.tracker}</td>
                        <td className="py-3 px-4 font-medium text-slate-200">{r.title}</td>
                        <td className="py-3 px-4">
                          <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                            {r.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-emerald-500 h-1.5 rounded-full"
                                style={{ width: `${r.dorScore}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono">{r.dorScore}/100</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {r.agent ? (
                            <span className="flex items-center gap-1.5 text-violet-300 font-mono text-xs">
                              <Bot className="h-3.5 w-3.5" />
                              {r.agent}
                            </span>
                          ) : (
                            <span className="text-slate-500">Sin agente</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">{r.spentHours}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'marknote' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Editor de Documentos Marknote (F1)</h2>
                <p className="text-sm text-slate-400">
                  Modelo de contenido unificado · Proyección en secciones e historial inmutable
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4 font-mono text-sm">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs text-slate-400">
                    <span>document_section (Fila SQL)</span>
                    <span className="text-emerald-400 font-medium">Sincronizado vía PL/pgSQL</span>
                  </div>
                  <pre className="text-slate-300 whitespace-pre-wrap text-xs leading-relaxed">
                    {`# QG-142 — Exportar informes a PDF
## Situación actual
Actualmente los pipelines generan métricas en bruto pero no existe exportación formal.

## Propuesta de solución
Implementar generador PDF utilizando Goldmark y plantillas HTML firmadas en el servidor.`}
                  </pre>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs text-slate-400">
                    <span>Previsualización (Render Sanity Safe)</span>
                    <span className="text-indigo-400">Wikilinks [[ activados ]]</span>
                  </div>
                  <div className="prose prose-invert max-w-none text-sm space-y-3">
                    <h3 className="text-lg font-bold text-indigo-300">
                      QG-142 — Exportar informes a PDF
                    </h3>
                    <h4 className="font-semibold text-slate-200">Situación actual</h4>
                    <p className="text-slate-300">
                      Actualmente los pipelines generan métricas en bruto pero no existe exportación formal.
                    </p>
                    <h4 className="font-semibold text-slate-200">Propuesta de solución</h4>
                    <p className="text-slate-300">
                      Implementar generador PDF utilizando <code className="text-indigo-300">Goldmark</code> y plantillas HTML firmadas en el servidor.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Cola de Trabajo & Servidor MCP (F3 - F4)</h2>
                <p className="text-sm text-slate-400">
                  Reserva con arrendamiento no bloqueante (FOR UPDATE SKIP LOCKED) y monitoreo de sesiones
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[
                  { name: 'Claude-3.5-Sonnet', status: 'WORKING', claim: 'QG-142', expires: '14m 20s', cost: '$1.42' },
                  { name: 'Quagenticus-Worker-01', status: 'WORKING', claim: 'QG-108', expires: '08m 10s', cost: '$0.85' },
                  { name: 'Gemini-1.5-Pro', status: 'IDLE', claim: 'ninguno', expires: '--', cost: '$0.12' }
                ].map(agent => (
                  <div
                    key={agent.name}
                    className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200 flex items-center gap-2">
                        <Bot className="h-4 w-4 text-indigo-400" />
                        {agent.name}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {agent.status}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-400">
                      <div className="flex justify-between">
                        <span>Requerimiento reservado:</span>
                        <span className="font-mono text-indigo-300">{agent.claim}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Expiración de Lease:</span>
                        <span className="font-mono text-amber-400">{agent.expires}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Coste Acumulado:</span>
                        <span className="font-mono text-slate-200">{agent.cost}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Selected Requirement Bottom Inspector Bar */}
        {selectedReq && (
          <footer className="h-12 border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-6 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-indigo-400">{selectedReq.ref}</span>
              <span className="text-slate-200 font-medium truncate max-w-md">{selectedReq.title}</span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 uppercase font-mono text-[10px]">
                {selectedReq.tracker}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span>DoR: <strong className="text-emerald-400 font-mono">{selectedReq.dorScore}%</strong></span>
              <span>Horas: <strong className="text-slate-200 font-mono">{selectedReq.spentHours}h</strong></span>
              <span>Asignado: <strong className="text-slate-200">{selectedReq.assignee}</strong></span>
            </div>
          </footer>
        )}
      </main>
    </div>
  );
}
