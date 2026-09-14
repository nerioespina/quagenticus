import { createContext, memo, useContext, useMemo } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { Link } from 'react-router-dom';
import { FileText, Paperclip } from 'lucide-react';
import remarkRefs from './remarkRefs';
import { extractRefs } from '../../lib/refs';
import { useResolvedRefs } from '../../hooks/useSearch';
import { openAttachment, useSignedUrls } from '../../hooks/useAttachments';
import type { ResolvedRefs } from '../../lib/api';

const schema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), 'qg-ref', 'attachment'],
    src: [...(defaultSchema.protocols?.src ?? []), 'attachment'],
  },
};

interface Ctx {
  spaceId: string;
  refs: ResolvedRefs | undefined;
  signed: Record<string, { url: string; filename: string; content_type: string }> | undefined;
}
const MarkdownContext = createContext<Ctx>({ spaceId: '', refs: undefined, signed: undefined });

function urlTransform(url: string) {
  if (url.startsWith('qg-ref:') || url.startsWith('attachment:')) return url;
  return defaultUrlTransform(url);
}

function RefAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  const { refs, spaceId } = useContext(MarkdownContext);
  const [, kind, rawKey] = href.split(':');
  const key = decodeURIComponent(rawKey ?? '');

  if (kind === 'requirement') {
    const r = refs?.requirements[key];
    if (!r) {
      return (
        <span className="ref-chip ref-chip--missing" title={refs ? 'Requerimiento no encontrado' : 'Resolviendo…'}>
          {children}
        </span>
      );
    }
    return (
      <Link
        to={`/spaces/${r.space_id}/requirements/${r.id}`}
        className={`ref-chip ${r.is_closed ? 'line-through opacity-70' : ''}`}
        title={`${r.ref_key} · ${r.title} (${r.status_name})`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.status_color ?? '#64748b' }} />
        {r.ref_key}
        <span className="ref-chip__title">{r.title}</span>
      </Link>
    );
  }
  if (kind === 'wikilink') {
    const d = refs?.documents[key];
    if (!d) {
      return (
        <span className="ref-chip ref-chip--broken" title="Documento no encontrado (enlace roto)">
          <FileText className="h-3 w-3" />
          {children}
        </span>
      );
    }
    const to = d.doc_type === 'requirement' ? `/spaces/${d.space_id}/requirements/${d.id}` : `/spaces/${spaceId || d.space_id}/docs/${d.id}`;
    return (
      <Link to={to} className="ref-chip" title={d.title} onClick={(e) => e.stopPropagation()}>
        <FileText className="h-3 w-3" />
        {children}
      </Link>
    );
  }
  const u = refs?.users[key];
  return (
    <span className={u ? 'mention' : ''} title={u?.display_name}>
      {children}
    </span>
  );
}

function MdLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  const { signed } = useContext(MarkdownContext);
  if (!href) return <>{children}</>;
  if (href.startsWith('qg-ref:')) return <RefAnchor href={href}>{children}</RefAnchor>;
  if (href.startsWith('attachment:')) {
    const id = href.slice('attachment:'.length);
    return (
      <button type="button" className="attachment-link" onClick={() => openAttachment(id)} title={signed?.[id]?.filename}>
        <Paperclip className="h-3 w-3" />
        {children}
      </button>
    );
  }
  const internal = href.startsWith('/') && !href.startsWith('//');
  if (internal) return <Link to={href}>{children}</Link>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  );
}

function MdImage({ src, alt }: { src?: string; alt?: string }) {
  const { signed } = useContext(MarkdownContext);
  if (!src) return null;
  if (src.startsWith('attachment:')) {
    const id = src.slice('attachment:'.length);
    const url = signed?.[id]?.url;
    if (!url) return <span className="inline-block h-24 w-40 rounded-lg bg-[var(--bg-surface-hover)] animate-pulse align-middle" title={alt} />;
    return (
      <button type="button" onClick={() => openAttachment(id)} className="inline-block align-middle" title="Abrir imagen">
        <img src={url} alt={alt ?? ''} loading="lazy" className="max-h-96 rounded-lg border border-[var(--border-color)]" />
      </button>
    );
  }
  return <img src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" className="max-h-96 rounded-lg" />;
}

const components = { a: MdLink, img: MdImage };

interface MarkdownProps {
  content: string;
  spaceId: string;
  className?: string;
  empty?: React.ReactNode;
}

/** The single markdown renderer: GFM, sanitized HTML, resolved references and signed attachments. */
function MarkdownImpl({ content, spaceId, className = '', empty }: MarkdownProps) {
  const extracted = useMemo(() => extractRefs(content), [content]);
  const { data: refs } = useResolvedRefs(spaceId, extracted);
  const { data: signed } = useSignedUrls(extracted.attachments);
  const ctx = useMemo(() => ({ spaceId, refs, signed }), [spaceId, refs, signed]);

  if (!content?.trim()) return <>{empty ?? null}</>;
  return (
    <MarkdownContext.Provider value={ctx}>
      <div className={`markdown ${className}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkRefs]}
          rehypePlugins={[[rehypeSanitize, schema]]}
          urlTransform={urlTransform}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
    </MarkdownContext.Provider>
  );
}

const Markdown = memo(MarkdownImpl);
export default Markdown;
