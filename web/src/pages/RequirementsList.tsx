import { useState, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Plus, Loader2 } from 'lucide-react';
import { useRequirements, useCreateRequirement } from '../hooks/useRequirements';
import { api } from '../lib/api';
import type { Tracker, Priority } from '../lib/api';
import { useQuery } from '@tanstack/react-query';
import Modal from '../components/Modal';
import MarkdownToolbar from '../components/MarkdownToolbar';

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
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Nuevo requerimiento"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Título
            </label>
            <input
              placeholder="Título del requerimiento"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Tracker
              </label>
              <select
                value={form.tracker_id}
                onChange={e => setForm(f => ({ ...f, tracker_id: e.target.value }))}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
              >
                <option value="">Seleccionar Tracker…</option>
                {trackers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Prioridad
              </label>
              <select
                value={form.priority_id}
                onChange={e => setForm(f => ({ ...f, priority_id: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
              >
                <option value="">Seleccionar Prioridad…</option>
                {priorities.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Descripción (Markdown)
            </label>
            <div className="border border-slate-700/80 rounded-lg overflow-hidden bg-slate-800/40">
              <MarkdownToolbar
                textareaRef={textareaRef}
                onValueChange={(val) => setForm(f => ({ ...f, body_md: val }))}
              />
              <textarea
                ref={textareaRef}
                placeholder="Escribe la descripción en formato Markdown..."
                value={form.body_md}
                onChange={e => setForm(f => ({ ...f, body_md: e.target.value }))}
                rows={10}
                className="w-full bg-slate-900 border-t border-slate-700/80 p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-mono resize-y min-h-[200px]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createReq.isPending}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white text-sm font-semibold transition-colors"
            >
              {createReq.isPending ? 'Creando…' : 'Crear requerimiento'}
            </button>
          </div>
        </form>
      </Modal>

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
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/spaces/${spaceId}/requirements/${r.id}`)}
                    className="hover:bg-slate-800/30 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-indigo-400 whitespace-nowrap">{r.ref_key}</td>
                    <td className="py-3 px-4 uppercase text-xs font-mono text-slate-500">{tracker?.key ?? '—'}</td>
                    <td className="py-3 px-4 font-medium text-slate-200">{r.title}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status_key] ?? STATUS_COLORS.new}`}>
                        {r.status_name || r.status_id}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs text-slate-400">{priority?.name ?? r.priority_name ?? r.priority_id}</span>
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
