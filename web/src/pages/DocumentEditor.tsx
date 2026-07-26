import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Eye, Edit3, ArrowLeft, Loader2 } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { useDocument, useUpdateDocument } from '../hooks/useDocuments';

function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="prose prose-invert max-w-none text-sm px-6 py-5 space-y-3">
      {lines.map((line, i) => {
        if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-bold text-slate-100">{line.slice(2)}</h1>;
        if (line.startsWith('## ')) return <h2 key={i} className="text-xl font-semibold text-slate-200">{line.slice(3)}</h2>;
        if (line.startsWith('### ')) return <h3 key={i} className="text-lg font-semibold text-slate-300">{line.slice(4)}</h3>;
        if (line.startsWith('- [ ] ')) return <div key={i} className="flex items-center gap-2"><input type="checkbox" disabled className="accent-indigo-500" /><span className="text-slate-300">{line.slice(6)}</span></div>;
        if (line.startsWith('- [x] ')) return <div key={i} className="flex items-center gap-2"><input type="checkbox" checked disabled className="accent-indigo-500" /><span className="line-through text-slate-500">{line.slice(6)}</span></div>;
        if (line.startsWith('- ')) return <li key={i} className="text-slate-300 ml-4">{line.slice(2)}</li>;
        if (line === '') return <div key={i} className="h-3" />;
        return <p key={i} className="text-slate-300 leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

export default function DocumentEditor() {
  const { spaceId, docId } = useParams<{ spaceId: string; docId: string }>();
  const navigate = useNavigate();
  const { data: doc, isLoading } = useDocument(docId ?? '');
  const update = useUpdateDocument();

  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (doc) {
      setContent(doc.body_md);
      setTitle(doc.title);
    }
  }, [doc?.id]);

  const handleContentChange = useCallback((val: string) => {
    setContent(val);
    setDirty(true);
  }, []);

  const handleSave = async () => {
    if (!docId) return;
    await update.mutateAsync({ id: docId, title, body_md: content, version: doc?.version });
    setDirty(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 text-slate-500 animate-spin" />
      </div>
    );
  }

  if (!doc) {
    return <div className="p-6 text-slate-500">Documento no encontrado.</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-800 bg-slate-950/60 backdrop-blur shrink-0">
        <button
          onClick={() => navigate(`/spaces/${spaceId}/docs`)}
          className="p-1.5 rounded-md hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <input
          value={title}
          onChange={e => { setTitle(e.target.value); setDirty(true); }}
          className="flex-1 bg-transparent text-slate-100 font-semibold text-lg focus:outline-none placeholder-slate-600"
          placeholder="Título del documento"
        />

        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
          {(['edit', 'split', 'preview'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                mode === m ? 'bg-slate-800 text-slate-200' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {m === 'edit' ? <Edit3 className="h-3.5 w-3.5" /> : m === 'preview' ? <Eye className="h-3.5 w-3.5" /> : 'Split'}
            </button>
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={!dirty || update.isPending}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-semibold transition-all"
        >
          {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {dirty ? 'Guardar' : 'Guardado'}
        </button>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-hidden flex">
        {(mode === 'edit' || mode === 'split') && (
          <div className={`${mode === 'split' ? 'w-1/2 border-r border-slate-800' : 'flex-1'} overflow-auto`}>
            <CodeMirror
              value={content}
              onChange={handleContentChange}
              extensions={[markdown()]}
              theme="dark"
              height="100%"
              style={{ height: '100%', fontSize: '13px' }}
              basicSetup={{ lineNumbers: true, foldGutter: false }}
            />
          </div>
        )}
        {(mode === 'preview' || mode === 'split') && (
          <div className={`${mode === 'split' ? 'w-1/2' : 'flex-1'} overflow-auto bg-slate-950`}>
            <MarkdownPreview content={content} />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-5 py-1.5 border-t border-slate-800/60 text-xs text-slate-600 shrink-0">
        <span className="font-mono">v{doc.version}</span>
        <span>{content.length} caracteres · {content.split(/\s+/).filter(Boolean).length} palabras</span>
        {dirty && <span className="text-amber-500">• Sin guardar</span>}
      </div>
    </div>
  );
}
