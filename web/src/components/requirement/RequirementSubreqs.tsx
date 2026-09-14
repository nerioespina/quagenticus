import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GitCommit, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, EmptyState, Spinner } from '../ui/misc';
import { AvatarStack } from '../ui/Avatar';
import { useCreateRequirement, useRequirementChildren } from '../../hooks/useRequirements';
import { useTrackers } from '../../hooks/useCatalogs';
import { errorMessage } from '../../lib/api';

export default function RequirementSubreqs({ spaceId, reqId, canEdit }: { spaceId: string; reqId: string; canEdit: boolean }) {
  const { data: children = [], isLoading } = useRequirementChildren(reqId);
  const { data: trackers = [] } = useTrackers();
  const create = useCreateRequirement(spaceId);
  const [title, setTitle] = useState('');
  const [trackerId, setTrackerId] = useState('');
  const done = children.filter((c) => c.status_is_closed).length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const tracker = trackerId || trackers[0]?.id;
    if (!title.trim() || !tracker) return;
    create.mutate(
      { tracker_id: tracker, title: title.trim(), parent_id: reqId },
      { onSuccess: () => setTitle(''), onError: (err) => toast.error(errorMessage(err)) },
    );
  };

  return (
    <div className="space-y-4">
      {children.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <div className="h-1.5 flex-1 rounded-full bg-[var(--bg-surface-hover)] overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${(done / children.length) * 100}%` }} />
          </div>
          {done}/{children.length} cerrados
        </div>
      )}
      {isLoading ? (
        <Spinner />
      ) : children.length === 0 ? (
        <EmptyState icon={<GitCommit className="h-6 w-6" />} title="Sin sub-requerimientos" description="Divide el trabajo en piezas más pequeñas." />
      ) : (
        <ul className="divide-y divide-[var(--border-color)] border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--bg-surface)]">
          {children.map((c) => (
            <li key={c.id}>
              <Link to={`/spaces/${spaceId}/requirements/${c.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-surface-hover)] min-w-0">
                <span className="text-xs font-mono font-bold text-[var(--accent-text)] shrink-0">{c.ref_key}</span>
                <span className={`text-xs font-medium truncate ${c.status_is_closed ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>{c.title}</span>
                <span className="ml-auto flex items-center gap-2 shrink-0">
                  <AvatarStack members={c.members} size={18} />
                  <Badge color={c.status_color}>{c.status_name}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del sub-requerimiento" className="input flex-1 min-w-[200px] py-1.5 text-xs" />
          <select value={trackerId} onChange={(e) => setTrackerId(e.target.value)} aria-label="Tipo" className="input w-auto py-1.5 text-xs">
            {trackers.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
          </select>
          <button type="submit" disabled={!title.trim() || create.isPending} className="btn-primary text-xs">
            <Plus className="h-3.5 w-3.5" /> Añadir
          </button>
        </form>
      )}
    </div>
  );
}
