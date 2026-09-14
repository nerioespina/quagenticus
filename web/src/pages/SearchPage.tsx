import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, GitCommit, Search } from 'lucide-react';
import { Badge, EmptyState, Spinner } from '../components/ui/misc';
import { useSearch } from '../hooks/useSearch';
import { useSpaces } from '../hooks/useSpaces';
import { DOC_TYPE_LABELS } from '../lib/i18n';
import { formatRelative } from '../lib/dates';

/** Renders ts_headline output safely: only <mark> is honoured, everything else is text. */
function Snippet({ html }: { html: string }) {
  const parts = html.split(/(<mark>|<\/mark>)/);
  let marked = false;
  return (
    <p className="text-xs text-[var(--text-muted)] line-clamp-2">
      {parts.map((p, i) => {
        if (p === '<mark>') { marked = true; return null; }
        if (p === '</mark>') { marked = false; return null; }
        return marked ? <mark key={i} className="bg-amber-300/40 text-[var(--text-primary)] rounded px-0.5">{p}</mark> : <span key={i}>{p}</span>;
      })}
    </p>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const spaceId = params.get('space') ?? '';
  const { data: spaces = [] } = useSpaces();
  const { data: results = [], isFetching } = useSearch(params.get('q') ?? '', spaceId || undefined);
  useEffect(() => setQ(params.get('q') ?? ''), [params]);

  return (
    <div className="p-4 md:p-6 max-w-4xl space-y-4">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setParams((p) => { p.set('q', q); return p; }); }}>
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en requerimientos y documentos (admite “frases”, -excluir, OR)" className="input pl-9" />
        </div>
        <select value={spaceId} onChange={(e) => setParams((p) => { if (e.target.value) p.set('space', e.target.value); else p.delete('space'); return p; })} className="input w-auto" aria-label="Espacio">
          <option value="">Todos los espacios</option>
          {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button type="submit" className="btn-primary">Buscar</button>
      </form>
      {isFetching && <Spinner />}
      {!isFetching && params.get('q') && results.length === 0 && <EmptyState icon={<Search className="h-6 w-6" />} title="Sin resultados" />}
      <ul className="space-y-2">
        {results.map((r) => (
          <li key={r.id}>
            <Link to={r.doc_type === 'requirement' ? `/spaces/${r.space_id}/requirements/${r.id}` : `/spaces/${r.space_id}/docs/${r.id}`} className="card p-3 flex gap-3 hover:border-[var(--accent-color)]/40">
              {r.doc_type === 'requirement' ? <GitCommit className="h-4 w-4 mt-0.5 text-[var(--accent-text)] shrink-0" /> : <FileText className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />}
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                  {r.ref_key && <span className="font-mono text-xs text-[var(--accent-text)]">{r.ref_key}</span>}
                  {r.title}
                  {r.status_name && <Badge>{r.status_name}</Badge>}
                </p>
                <Snippet html={r.snippet} />
                <p className="text-[10px] text-[var(--text-muted)]">{r.space_key} · {DOC_TYPE_LABELS[r.doc_type]} · {formatRelative(r.updated_at)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
