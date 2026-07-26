import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Loader2 } from 'lucide-react';
import { useRequirements, useCreateRequirement } from '../hooks/useRequirements';
import { api } from '../lib/api';
import type { Tracker, Priority } from '../lib/api';
import { useQuery } from '@tanstack/react-query';

interface Context { spaceId: string; search: string }

function useTrackers() {
  return useQuery({ queryKey: ['trackers'], queryFn: () => api.get<Tracker[]>('/catalogs/trackers') });
}
function usePriorities() {
  return useQuery({ queryKey: ['priorities'], queryFn: () => api.get<Priority[]>('/catalogs/priorities') });
}

const STATUS_COLORS: Record<string, string> = {
  new:          'bg-slate-700/50 text-slate-400',
  triaged:      'bg-slate-700/50 text-slate-300',
  ready:        'bg-indigo-500/20 text-indigo-300',
  in_analysis:  'bg-amber-500/20 text-amber-400',
  in_progress:  'bg-violet-500/20 text-violet-300',
  in_review:    'bg-cyan-500/20 text-cyan-400',
  resolved:     'bg-emerald-500/20 text-emerald-400',
  closed:       'bg-slate-800 text-slate-500',
};

export default function RequirementsList() {
  const { spaceId, search } = useOutletContext<Context>();
  const { data: reqs = [], isLoading } = useRequirements(spaceId);
  const { data: trackers = [] } = useTrackers();
  const { data: priorities = [] } = usePriorities();
  const createReq = useCreateRequirement(spaceId);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '',
    body_md: '',
    tracker_id: '',
    priority_id: '',
  });

  const filtered = reqs.filter(r =>
    !search ||
    r.title.toLowerCase().includes(search.toLowerCase()) ||
    (r.ref_key ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tracker_id) return;
    const priorityId = form.priority_id || priorities.find(p => p.is_default)?.id || priorities[0]?.id;
    await createReq.mutateAsync({ ...form, priority_id: priorityId! });
    setShowForm(false);
    setForm({ title: '', body_md: '', tracker_id: '', priority_id: '' });
  };

  const trackerMap = Object.fromEntries(trackers.map(t => [t.id, t]));
  const priorityMap = Object.fromEntries(priorities.map(p => [p.id, p]));

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Requerimientos</h2>
          <p className="text-xs text-slate-500 mt-0.5">Transiciones de estado · Definition of Ready · Multiasignación</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">Nuevo requerimiento</h3>
          <input
            placeholder="Título del requerimiento"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            required
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60"
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.tracker_id}
              onChange={e => setForm(f => ({ ...f, tracker_id: e.target.value }))}
              required
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
            >
              <option value="">Tracker…</option>
              {trackers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select
              value={form.priority_id}
              onChange={e => setForm(f => ({ ...f, priority_id: e.target.value }))}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
            >
              <option value="">Prioridad…</option>
              {priorities.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <textarea
            placeholder="Descripción en Markdown (opcional)"
            value={form.body_md}
            onChange={e => setForm(f => ({ ...f, body_md: e.target.value }))}
            rows={3}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 font-mono resize-none"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createReq.isPending}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white text-sm font-semibold transition-colors"
            >
              {createReq.isPending ? 'Creando…' : 'Crear requerimiento'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 text-slate-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            {search ? 'Sin resultados para la búsqueda.' : 'No hay requerimientos en este espacio.'}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Ref</th>
                <th className="py-3 px-4">Tracker</th>
                <th className="py-3 px-4">Título</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4">Prioridad</th>
                <th className="py-3 px-4">DoR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {filtered.map(r => {
                const tracker = trackerMap[r.tracker_id];
                const priority = priorityMap[r.priority_id];
                return (
                  <tr key={r.id} className="hover:bg-slate-800/30 cursor-pointer transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-indigo-400 whitespace-nowrap">{r.ref_key}</td>
                    <td className="py-3 px-4 uppercase text-xs font-mono text-slate-500">{tracker?.key ?? '—'}</td>
                    <td className="py-3 px-4 font-medium text-slate-200">{r.title}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status_id] ?? STATUS_COLORS.new}`}>
                        {r.status_id}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs text-slate-400">{priority?.name ?? r.priority_id}</span>
                    </td>
                    <td className="py-3 px-4">
                      {r.readiness_score != null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${r.readiness_score}%` }} />
                          </div>
                          <span className="text-xs font-mono text-slate-400">{r.readiness_score}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
