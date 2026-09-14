import { useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '../ui/Modal';
import { Spinner } from '../ui/misc';
import { confirmDialog } from '../ui/Confirm';
import { useDocumentHistory, useDocumentVersion, useRestoreVersion } from '../../hooks/useDocuments';
import { diffLines } from '../../lib/diff';
import { formatDateTime, formatRelative } from '../../lib/dates';
import { errorMessage } from '../../lib/api';

export default function VersionHistory({ docId, current, canRestore }: { docId: string; current: string; canRestore: boolean }) {
  const { data: versions = [], isLoading } = useDocumentHistory(docId);
  const [viewing, setViewing] = useState<number | null>(null);
  const { data: version, isLoading: loadingVersion } = useDocumentVersion(docId, viewing);
  const restore = useRestoreVersion(docId);

  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {versions.map((v) => (
          <li key={v.id}>
            <button type="button" onClick={() => setViewing(v.version)} className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-[var(--bg-surface-hover)]">
              <p className="text-xs font-medium text-[var(--text-primary)]">v{v.version} · {v.title}</p>
              <p className="text-[10px] text-[var(--text-muted)]" title={formatDateTime(v.created_at)}>
                {v.actor_name ?? 'Sistema'} · {formatRelative(v.created_at)} · {v.length ?? 0} caracteres
              </p>
            </button>
          </li>
        ))}
        {versions.length === 0 && <li className="text-xs text-[var(--text-muted)] flex items-center gap-1"><History className="h-3.5 w-3.5" /> Sin versiones anteriores.</li>}
      </ul>
      {viewing !== null && (
        <Modal
          isOpen
          onClose={() => setViewing(null)}
          title={`Versión ${viewing} comparada con la actual`}
          className="max-w-4xl"
          footer={
            canRestore && (
              <button
                type="button"
                className="btn-primary"
                disabled={restore.isPending}
                onClick={async () => {
                  if ((await confirmDialog({ title: `Restaurar la versión ${viewing}`, message: 'Se creará una nueva versión con ese contenido; nada se pierde.', confirmLabel: 'Restaurar' })) === false) return;
                  restore.mutate(viewing, { onSuccess: () => { toast.success('Versión restaurada'); setViewing(null); }, onError: (e) => toast.error(errorMessage(e)) });
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Restaurar esta versión
              </button>
            )
          }
        >
          {loadingVersion || !version ? (
            <Spinner />
          ) : (
            <pre className="text-xs font-mono max-h-[60vh] overflow-auto rounded-lg border border-[var(--border-color)]">
              {diffLines(version.body_md ?? '', current).map((l, i) => (
                <div key={i} className={l.type === 'add' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : l.type === 'del' ? 'bg-rose-500/10 text-rose-600' : 'text-[var(--text-secondary)]'}>
                  <span className="inline-block w-10 text-right pr-2 text-[var(--text-muted)] select-none">{l.oldNo ?? ''}</span>
                  <span className="inline-block w-10 text-right pr-2 text-[var(--text-muted)] select-none">{l.newNo ?? ''}</span>
                  {l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  '}
                  {l.text}
                </div>
              ))}
            </pre>
          )}
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">En rojo lo que tenía la versión {viewing} y ya no está; en verde lo añadido después.</p>
        </Modal>
      )}
    </div>
  );
}
