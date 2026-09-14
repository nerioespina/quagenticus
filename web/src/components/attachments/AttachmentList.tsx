import { Download, FileArchive, FileImage, FileText, FileVideo, Paperclip, Trash2 } from 'lucide-react';
import type { AttachmentRef } from '../../lib/api';
import { formatBytes } from '../../lib/colors';
import { formatRelative } from '../../lib/dates';
import { openAttachment, useSignedUrls } from '../../hooks/useAttachments';

function FileIcon({ type }: { type: string }) {
  if (type.startsWith('image/')) return <FileImage className="h-4 w-4 text-sky-500" />;
  if (type.startsWith('video/')) return <FileVideo className="h-4 w-4 text-violet-500" />;
  if (type.includes('zip') || type.includes('compressed')) return <FileArchive className="h-4 w-4 text-amber-500" />;
  if (type === 'application/pdf' || type.startsWith('text/')) return <FileText className="h-4 w-4 text-rose-500" />;
  return <Paperclip className="h-4 w-4 text-[var(--text-muted)]" />;
}

interface Props {
  items: (AttachmentRef & { creator_name?: string | null; journal_id?: string | null })[];
  onDelete?: (id: string) => void;
  compact?: boolean;
  onGoToComment?: (journalId: string) => void;
}

export default function AttachmentList({ items, onDelete, compact, onGoToComment }: Props) {
  const imageIds = items.filter((a) => a.content_type.startsWith('image/')).map((a) => a.id);
  const { data: signed } = useSignedUrls(imageIds);
  if (items.length === 0) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((a) =>
          a.content_type.startsWith('image/') && signed?.[a.id] ? (
            <button key={a.id} type="button" onClick={() => openAttachment(a.id)} title={a.filename} className="block">
              <img src={signed[a.id].url} alt={a.filename} className="h-20 w-28 object-cover rounded-lg border border-[var(--border-color)]" />
            </button>
          ) : (
            <button
              key={a.id}
              type="button"
              onClick={() => openAttachment(a.id)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] hover:border-[var(--accent-color)] max-w-[220px]"
            >
              <FileIcon type={a.content_type} />
              <span className="truncate">{a.filename}</span>
              <span className="text-[10px] text-[var(--text-muted)] shrink-0">{formatBytes(a.byte_size)}</span>
            </button>
          ),
        )}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border-color)] border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--bg-surface)]">
      {items.map((a) => (
        <li key={a.id} className="flex items-center gap-3 p-2.5 hover:bg-[var(--bg-surface-hover)]">
          {a.content_type.startsWith('image/') && signed?.[a.id] ? (
            <img src={signed[a.id].url} alt="" className="h-10 w-10 object-cover rounded-md border border-[var(--border-color)] shrink-0" />
          ) : (
            <span className="h-10 w-10 flex items-center justify-center rounded-md bg-[var(--bg-surface-hover)] shrink-0">
              <FileIcon type={a.content_type} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => openAttachment(a.id)} className="block text-xs font-medium text-[var(--text-primary)] truncate hover:underline text-left max-w-full">
              {a.filename}
            </button>
            <p className="text-[10px] text-[var(--text-muted)]">
              {formatBytes(a.byte_size)} · {a.creator_name ? `${a.creator_name} · ` : ''}
              {formatRelative(a.created_at)}
              {a.journal_id && onGoToComment && (
                <>
                  {' · '}
                  <button type="button" className="underline" onClick={() => onGoToComment(a.journal_id!)}>
                    ver comentario
                  </button>
                </>
              )}
            </p>
          </div>
          <button type="button" onClick={() => openAttachment(a.id, true)} aria-label={`Descargar ${a.filename}`} className="icon-btn">
            <Download className="h-3.5 w-3.5" />
          </button>
          {onDelete && (
            <button type="button" onClick={() => onDelete(a.id)} aria-label={`Eliminar ${a.filename}`} className="icon-btn hover:text-red-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
