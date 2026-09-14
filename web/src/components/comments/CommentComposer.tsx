import { useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import MarkdownEditor from '../editor/MarkdownEditor';
import type { MarkdownEditorHandle } from '../editor/MarkdownEditor';
import { useCommentMutations } from '../../hooks/useJournals';
import { deleteStaged } from '../../hooks/useAttachments';
import { errorMessage } from '../../lib/api';
import type { UploadedFile } from '../../lib/api';
import { formatBytes } from '../../lib/colors';

interface Props {
  docId: string;
  spaceId: string;
  replyToId?: string | null;
  onDone?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
  compact?: boolean;
}

const draftKey = (docId: string, replyTo?: string | null) => `qg_draft_${docId}_${replyTo ?? 'root'}`;

export default function CommentComposer({ docId, spaceId, replyToId, onDone, autoFocus, placeholder, compact }: Props) {
  const [text, setText] = useState(() => sessionStorage.getItem(draftKey(docId, replyToId)) ?? '');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const { create } = useCommentMutations(docId);
  const editor = useRef<MarkdownEditorHandle>(null);

  useEffect(() => {
    if (text) sessionStorage.setItem(draftKey(docId, replyToId), text);
    else sessionStorage.removeItem(draftKey(docId, replyToId));
  }, [text, docId, replyToId]);

  // only files still referenced or explicitly attached are sent
  const submit = () => {
    if (!text.trim() && files.length === 0) return;
    create.mutate(
      { notes_md: text, reply_to_id: replyToId ?? null, attachment_ids: files.map((f) => f.id) },
      {
        onSuccess: () => {
          setText('');
          setFiles([]);
          sessionStorage.removeItem(draftKey(docId, replyToId));
          onDone?.();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const removeFile = (f: UploadedFile) => {
    setFiles((list) => list.filter((x) => x.id !== f.id));
    setText((t) => t.replace(new RegExp(`!?\\[[^\\]]*\\]\\(attachment:${f.id}\\)\\n?`, 'g'), ''));
    deleteStaged(f.id).catch(() => undefined);
  };

  return (
    <div className="space-y-2">
      <MarkdownEditor
        ref={editor}
        value={text}
        onChange={setText}
        spaceId={spaceId}
        documentId={docId}
        uploadMode="staged"
        onFilesUploaded={(up) => setFiles((f) => [...f, ...up])}
        placeholder={placeholder ?? 'Escribe un comentario… usa #123 para referenciar, @persona para mencionar y pega capturas directamente'}
        rows={compact ? 3 : 4}
        autoFocus={autoFocus}
        onSubmit={submit}
        excludeRefId={docId}
      />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f) => (
            <span key={f.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-secondary)] max-w-[240px]">
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="truncate">{f.filename}</span>
              <span className="text-[var(--text-muted)] shrink-0">{formatBytes(f.byte_size)}</span>
              <button type="button" aria-label={`Quitar ${f.filename}`} onClick={() => removeFile(f)} className="icon-btn p-0.5">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <span className="text-[10px] text-[var(--text-muted)] mr-auto hidden sm:inline">Ctrl/⌘ + Enter para enviar</span>
        {onDone && replyToId && (
          <button type="button" onClick={onDone} className="btn-secondary text-xs">Cancelar</button>
        )}
        <button type="button" onClick={submit} disabled={(!text.trim() && files.length === 0) || create.isPending} className="btn-primary text-xs">
          {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {replyToId ? 'Responder' : 'Comentar'}
        </button>
      </div>
    </div>
  );
}
