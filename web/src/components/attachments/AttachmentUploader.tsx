import { useRef, useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { useUploadToDocument } from '../../hooks/useAttachments';
import { errorMessage } from '../../lib/api';

interface Props {
  documentId: string;
  maxMb?: number;
  maxFiles?: number;
  disabled?: boolean;
}

/** Drop zone that attaches files directly to a document, with progress. */
export default function AttachmentUploader({ documentId, maxMb = 25, maxFiles = 10, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const upload = useUploadToDocument(documentId);

  const send = (files: File[]) => {
    if (disabled || files.length === 0) return;
    const tooBig = files.filter((f) => f.size > maxMb * 1024 * 1024);
    if (tooBig.length) toast.error(`${tooBig.map((f) => f.name).join(', ')}: supera ${maxMb} MB`);
    const ok = files.filter((f) => f.size <= maxMb * 1024 * 1024).slice(0, maxFiles);
    if (files.length > maxFiles) toast.warning(`Solo se suben ${maxFiles} archivos por vez`);
    if (!ok.length) return;
    setProgress(0);
    upload.mutate(
      { files: ok, onProgress: (p) => setProgress(p.total ? p.loaded / p.total : 0) },
      {
        onSuccess: (res) => toast.success(res.length === 1 ? `«${res[0].filename}» adjuntado` : `${res.length} archivos adjuntados`),
        onError: (e) => toast.error(errorMessage(e)),
        onSettled: () => setProgress(null),
      },
    );
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onClick={() => !disabled && progress === null && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        send([...e.dataTransfer.files]);
      }}
      className={`flex flex-col items-center justify-center gap-1 p-4 border-2 border-dashed rounded-xl cursor-pointer text-center transition-colors ${
        dragging ? 'border-[var(--accent-color)] bg-[var(--accent-soft)]' : 'border-[var(--border-color)] hover:border-[var(--text-muted)]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => { send([...(e.target.files ?? [])]); e.target.value = ''; }} />
      {progress !== null ? (
        <div className="w-full max-w-xs space-y-1">
          <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo… {Math.round(progress * 100)}%
          </div>
          <div className="h-1 rounded-full bg-[var(--bg-surface-hover)] overflow-hidden">
            <div className="h-full bg-[var(--accent-color)]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      ) : (
        <>
          <UploadCloud className="h-5 w-5 text-[var(--text-muted)]" />
          <p className="text-xs text-[var(--text-secondary)]">
            Arrastra archivos o <span className="text-[var(--accent-text)] underline">selecciónalos</span>
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">Máx. {maxMb} MB por archivo · {maxFiles} archivos por envío · también puedes pegar imágenes en el editor</p>
        </>
      )}
    </div>
  );
}
