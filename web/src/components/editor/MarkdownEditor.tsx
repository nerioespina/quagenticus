import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Edit3, Eye, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import MarkdownToolbar, { applyAction } from './MarkdownToolbar';
import type { ToolbarAction } from './MarkdownToolbar';
import SuggestionList, { suggestionInsertText } from './SuggestionList';
import InsertReferenceModal from './InsertReferenceModal';
import { caretCoordinates } from './caret';
import Markdown from '../markdown/Markdown';
import { detectTrigger, suggestTypesFor } from '../../lib/refs';
import type { ActiveTrigger } from '../../lib/refs';
import { useSuggest } from '../../hooks/useSearch';
import { uploadStaged } from '../../hooks/useAttachments';
import { api, errorMessage } from '../../lib/api';
import type { UploadedFile } from '../../lib/api';
import { formatBytes } from '../../lib/colors';

export interface MarkdownEditorHandle {
  focus: () => void;
  insert: (text: string) => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  spaceId: string;
  /** Existing document for staged uploads (comments) or direct uploads. */
  documentId?: string;
  /** 'staged': files wait for adoption (comments, new requirements). 'direct': attach immediately. */
  uploadMode?: 'staged' | 'direct' | 'none';
  onFilesUploaded?: (files: UploadedFile[]) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  onSubmit?: () => void;
  excludeRefId?: string;
  toolbarExtra?: React.ReactNode;
  className?: string;
  maxUploadMb?: number;
}

interface Upload {
  key: string;
  name: string;
  size: number;
  progress: number;
}

const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(function MarkdownEditor(
  {
    value, onChange, spaceId, documentId, uploadMode = 'staged', onFilesUploaded, placeholder, rows = 6, autoFocus, onSubmit,
    excludeRefId, toolbarExtra, className = '', maxUploadMb = 25,
  },
  ref,
) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [trigger, setTrigger] = useState<ActiveTrigger | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [active, setActive] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [refModal, setRefModal] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(trigger?.query ?? ''), 120);
    return () => clearTimeout(t);
  }, [trigger?.query]);

  const types = trigger ? suggestTypesFor(trigger) : [];
  const { data: suggestions = [], isFetching } = useSuggest(spaceId, debouncedQuery, types, !!trigger);
  const items = suggestions.filter((s) => s.id !== excludeRefId);

  const setSelection = (start: number, end = start) => {
    requestAnimationFrame(() => {
      const el = textarea.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
    });
  };

  const insertAtCaret = useCallback(
    (text: string) => {
      const el = textarea.current;
      const current = valueRef.current;
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;
      const next = current.slice(0, start) + text + current.slice(end);
      onChange(next);
      setSelection(start + text.length);
    },
    [onChange],
  );

  useImperativeHandle(ref, () => ({ focus: () => textarea.current?.focus(), insert: insertAtCaret }), [insertAtCaret]);

  const updateTrigger = () => {
    const el = textarea.current;
    if (!el) return;
    const t = detectTrigger(el.value, el.selectionStart);
    setTrigger(t);
    if (t) {
      const c = caretCoordinates(el, t.start);
      setCoords({ top: c.top + c.height + 4, left: c.left });
      setActive(0);
    }
  };

  const pick = (index = active) => {
    const item = items[index];
    const el = textarea.current;
    if (!item || !trigger || !el) return;
    const text = suggestionInsertText(item);
    const next = value.slice(0, trigger.start) + text + value.slice(trigger.end);
    onChange(next);
    setTrigger(null);
    setSelection(trigger.start + text.length);
  };

  const onAction = (action: ToolbarAction) => {
    const el = textarea.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const r = applyAction(value, start, end, action);
    onChange(r.value);
    setSelection(r.selStart, r.selEnd);
  };

  const upload = async (files: File[]) => {
    if (uploadMode === 'none' || files.length === 0) return;
    const tooBig = files.filter((f) => f.size > maxUploadMb * 1024 * 1024);
    if (tooBig.length) toast.error(`${tooBig.map((f) => f.name).join(', ')} supera el máximo de ${maxUploadMb} MB`);
    const ok = files.filter((f) => f.size <= maxUploadMb * 1024 * 1024);
    if (ok.length === 0) return;
    const key = crypto.randomUUID();
    setUploads((u) => [...u, { key, name: ok.length === 1 ? ok[0].name : `${ok.length} archivos`, size: ok.reduce((s, f) => s + f.size, 0), progress: 0 }]);
    const onProgress = (p: { loaded: number; total: number }) =>
      setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: p.total ? p.loaded / p.total : 0 } : x)));
    try {
      const uploaded =
        uploadMode === 'direct' && documentId
          ? await api.upload<UploadedFile[]>(`/documents/${documentId}/attachments`, ok, onProgress)
          : await uploadStaged(spaceId, ok, documentId, onProgress);
      const snippet = uploaded
        .map((f) => (f.content_type.startsWith('image/') ? `![${f.filename}](attachment:${f.id})` : `[${f.filename}](attachment:${f.id})`))
        .join('\n');
      insertAtCaret((valueRef.current && !valueRef.current.endsWith('\n') ? '\n' : '') + snippet + '\n');
      onFilesUploaded?.(uploaded);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploads((u) => u.filter((x) => x.key !== key));
    }
  };

  useEffect(() => {
    if (autoFocus) textarea.current?.focus();
  }, [autoFocus]);

  return (
    <div
      className={`relative border rounded-xl overflow-hidden bg-[var(--bg-input)] ${dragging ? 'border-[var(--accent-color)]' : 'border-[var(--border-color)]'} ${className}`}
      onDragOver={(e) => {
        if (uploadMode !== 'none' && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (uploadMode === 'none' || e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        setDragging(false);
        upload([...e.dataTransfer.files]);
      }}
    >
      <MarkdownToolbar
        onAction={(a) => {
          setTab('write');
          onAction(a);
        }}
        onInsertReference={() => setRefModal(true)}
        onAttach={uploadMode !== 'none' ? () => fileInput.current?.click() : undefined}
        extra={
          <>
            {toolbarExtra}
            <div className="flex items-center rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] p-0.5">
              <button type="button" onClick={() => setTab('write')} className={`tab-pill ${tab === 'write' ? 'tab-pill--active' : ''}`}>
                <Edit3 className="h-3 w-3" /> Escribir
              </button>
              <button type="button" onClick={() => setTab('preview')} className={`tab-pill ${tab === 'preview' ? 'tab-pill--active' : ''}`}>
                <Eye className="h-3 w-3" /> Vista previa
              </button>
            </div>
          </>
        }
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          upload([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      {tab === 'write' ? (
        <textarea
          ref={textarea}
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            requestAnimationFrame(updateTrigger);
          }}
          onClick={updateTrigger}
          onBlur={() => setTimeout(() => setTrigger(null), 150)}
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (files.length && uploadMode !== 'none') {
              e.preventDefault();
              upload(files);
            }
          }}
          onKeyDown={(e) => {
            if (trigger && items.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => (a + 1) % items.length);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => (a - 1 + items.length) % items.length);
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                pick();
                return;
              }
            }
            if (e.key === 'Escape' && trigger) {
              e.stopPropagation();
              setTrigger(null);
              return;
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) {
              e.preventDefault();
              onSubmit();
            }
          }}
          onKeyUp={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) updateTrigger();
          }}
          className="block w-full bg-transparent p-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] font-mono resize-y outline-none min-h-[96px]"
        />
      ) : (
        <div className="p-4 min-h-[120px]">
          <Markdown content={value} spaceId={spaceId} empty={<p className="text-xs text-[var(--text-muted)] italic">Nada que previsualizar.</p>} />
        </div>
      )}
      {uploads.length > 0 && (
        <div className="px-3 py-2 border-t border-[var(--border-color)] space-y-1">
          {uploads.map((u) => (
            <div key={u.key} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="truncate">{u.name}</span>
              <span className="text-[var(--text-muted)]">{formatBytes(u.size)}</span>
              <div className="ml-auto h-1 w-24 rounded-full bg-[var(--bg-surface-hover)] overflow-hidden">
                <div className="h-full bg-[var(--accent-color)]" style={{ width: `${Math.round(u.progress * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {dragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-text)] pointer-events-none">
          Suelta los archivos para adjuntarlos
        </div>
      )}
      {trigger && coords && tab === 'write' &&
        createPortal(
          <div
            style={{ top: coords.top, left: Math.min(coords.left, window.innerWidth - 340) }}
            className="fixed z-[70] w-80 rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] shadow-[var(--shadow-md)]"
          >
            <div className="flex items-center justify-between px-3 pt-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              {trigger.kind === 'wiki' ? 'Documentos' : trigger.kind === 'hash' ? 'Requerimientos' : 'Personas y requerimientos'}
              <button type="button" onMouseDown={(e) => { e.preventDefault(); setTrigger(null); }} aria-label="Cerrar sugerencias">
                <X className="h-3 w-3" />
              </button>
            </div>
            <SuggestionList items={items} active={active} onHover={setActive} onPick={(it) => pick(items.indexOf(it))} loading={isFetching} />
          </div>,
          document.body,
        )}
      <InsertReferenceModal isOpen={refModal} onClose={() => setRefModal(false)} spaceId={spaceId} excludeId={excludeRefId} onInsert={insertAtCaret} />
    </div>
  );
});

export default MarkdownEditor;
