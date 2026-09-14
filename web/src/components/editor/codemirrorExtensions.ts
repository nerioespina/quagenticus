import { autocompletion } from '@codemirror/autocomplete';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { api } from '../../lib/api';
import type { SuggestItem, UploadedFile } from '../../lib/api';
import { detectTrigger, suggestTypesFor } from '../../lib/refs';

/** #/@/[[ autocompletion backed by the suggest endpoint. */
export function refCompletion(spaceId: string, excludeId?: string): Extension {
  const source = async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const trigger = detectTrigger(line.text, ctx.pos - line.from);
    if (!trigger) return null;
    const items = await api
      .get<SuggestItem[]>(`/spaces/${spaceId}/suggest?q=${encodeURIComponent(trigger.query)}&types=${suggestTypesFor(trigger).join(',')}&limit=12`)
      .catch(() => []);
    if (ctx.aborted) return null;
    return {
      from: line.from + trigger.start,
      to: ctx.pos,
      filter: false,
      options: items
        .filter((i) => i.id !== excludeId)
        .map((i) => ({
          label: i.kind === 'user' ? `@${i.ref_key}` : i.kind === 'requirement' ? `#${i.ref_key}` : `[[${i.title}]]`,
          detail: i.kind === 'document' ? i.subtitle ?? '' : i.title,
          info: i.kind === 'requirement' ? i.subtitle ?? undefined : undefined,
          type: i.kind === 'user' ? 'variable' : i.kind === 'requirement' ? 'constant' : 'text',
          apply: (i.kind === 'user' ? `@${i.ref_key}` : i.kind === 'requirement' ? `#${i.ref_key}` : `[[${i.title}]]`) + ' ',
        })),
    };
  };
  return autocompletion({ override: [source], activateOnTyping: true, icons: true });
}

/** Paste or drop files into the editor: upload to the document and insert markdown at the cursor. */
export function uploadOnPaste(documentId: string, onError: (msg: string) => void, maxMb = 25): Extension {
  const handle = (view: EditorView, files: File[], pos?: number) => {
    const ok = files.filter((f) => f.size <= maxMb * 1024 * 1024);
    if (ok.length < files.length) onError(`Algún archivo supera ${maxMb} MB`);
    if (!ok.length) return;
    const at = pos ?? view.state.selection.main.head;
    const placeholder = `![Subiendo ${ok.map((f) => f.name).join(', ')}…]()`;
    view.dispatch({ changes: { from: at, insert: placeholder } });
    api
      .upload<UploadedFile[]>(`/documents/${documentId}/attachments`, ok)
      .then((uploaded) => {
        const md = uploaded.map((f) => (f.content_type.startsWith('image/') ? `![${f.filename}](attachment:${f.id})` : `[${f.filename}](attachment:${f.id})`)).join('\n');
        const doc = view.state.doc.toString();
        const idx = doc.indexOf(placeholder);
        if (idx >= 0) view.dispatch({ changes: { from: idx, to: idx + placeholder.length, insert: md } });
      })
      .catch((e: Error) => {
        const doc = view.state.doc.toString();
        const idx = doc.indexOf(placeholder);
        if (idx >= 0) view.dispatch({ changes: { from: idx, to: idx + placeholder.length, insert: '' } });
        onError(e.message);
      });
  };
  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = [...(event.clipboardData?.files ?? [])];
      if (!files.length) return false;
      event.preventDefault();
      handle(view, files);
      return true;
    },
    drop(event, view) {
      const files = [...(event.dataTransfer?.files ?? [])];
      if (!files.length) return false;
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? undefined;
      handle(view, files, pos);
      return true;
    },
  });
}
