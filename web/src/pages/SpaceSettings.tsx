import { useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs } from '../components/ui/misc';
import SpaceMembersPanel from '../components/admin/SpaceMembersPanel';
import { BoardsAdmin, CategoriesAdmin, LabelsAdmin, MilestonesAdmin } from '../components/admin/TaxonomyAdmin';
import { useUpdateSpace } from '../hooks/useSpaces';
import { errorMessage } from '../lib/api';
import type { SpaceContext } from '../components/layout/AppLayout';

type Tab = 'general' | 'members' | 'labels' | 'categories' | 'milestones' | 'boards';

export default function SpaceSettings() {
  const { spaceId, space } = useOutletContext<SpaceContext>();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'general';
  const update = useUpdateSpace(spaceId);
  const [form, setForm] = useState({ name: '', description_md: '', color: '#6366f1', viewers_can_comment: true });
  const isAdmin = space?.my_role === 'admin';
  const isMaintainer = isAdmin || space?.my_role === 'maintainer';

  useEffect(() => {
    if (space) setForm({ name: space.name, description_md: space.description_md, color: space.color ?? '#6366f1', viewers_can_comment: space.settings?.viewers_can_comment !== false });
  }, [space]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'members', label: 'Miembros' },
    ...(isMaintainer ? [{ id: 'labels' as Tab, label: 'Etiquetas' }, { id: 'categories' as Tab, label: 'Categorías' }, { id: 'boards' as Tab, label: 'Tableros' }] : []),
    { id: 'milestones', label: 'Hitos' },
  ];

  return (
    <div className="p-4 md:p-6 max-w-4xl space-y-4">
      <h2 className="text-lg font-bold text-[var(--text-primary)]">Configuración de {space?.name}</h2>
      <Tabs<Tab> tabs={tabs} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'general' && (
        <form
          className="card p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate(
              { name: form.name, description_md: form.description_md, color: form.color, settings: { viewers_can_comment: form.viewers_can_comment } },
              { onSuccess: () => toast.success('Espacio actualizado'), onError: (err) => toast.error(errorMessage(err)) },
            );
          }}
        >
          <label className="block space-y-1"><span className="field-label">Nombre</span><input disabled={!isAdmin} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" /></label>
          <label className="block space-y-1"><span className="field-label">Clave</span><input disabled value={space?.key ?? ''} className="input font-mono" /></label>
          <label className="block space-y-1"><span className="field-label">Descripción (markdown)</span><textarea disabled={!isAdmin} rows={4} value={form.description_md} onChange={(e) => setForm({ ...form, description_md: e.target.value })} className="input font-mono" /></label>
          <label className="flex items-center gap-2 text-xs"><span className="field-label">Color</span><input disabled={!isAdmin} type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input disabled={!isAdmin} type="checkbox" checked={form.viewers_can_comment} onChange={(e) => setForm({ ...form, viewers_can_comment: e.target.checked })} className="accent-[var(--accent-color)]" />
            Los lectores pueden comentar
          </label>
          {isAdmin && (
            <div className="flex justify-between gap-2 pt-2">
              <button
                type="button"
                className="btn-danger text-xs"
                onClick={() => update.mutate({ is_archived: true }, { onSuccess: () => { toast.success('Espacio archivado'); window.location.assign('/'); }, onError: (err) => toast.error(errorMessage(err)) })}
              >
                Archivar espacio
              </button>
              <button type="submit" className="btn-primary text-xs" disabled={update.isPending}><Save className="h-3.5 w-3.5" /> Guardar</button>
            </div>
          )}
        </form>
      )}
      {tab === 'members' && <SpaceMembersPanel spaceId={spaceId} canManage={isAdmin} />}
      {tab === 'labels' && <LabelsAdmin spaceId={spaceId} />}
      {tab === 'categories' && <CategoriesAdmin spaceId={spaceId} />}
      {tab === 'milestones' && <MilestonesAdmin spaceId={spaceId} canEdit={isMaintainer} />}
      {tab === 'boards' && <BoardsAdmin spaceId={spaceId} />}
    </div>
  );
}
