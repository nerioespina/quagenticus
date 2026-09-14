import { FileText, GitCommit, User } from 'lucide-react';
import type { SuggestItem } from '../../lib/api';
import { DOC_TYPE_LABELS } from '../../lib/i18n';

interface Props {
  items: SuggestItem[];
  active: number;
  onPick: (item: SuggestItem) => void;
  onHover: (index: number) => void;
  loading?: boolean;
  emptyText?: string;
}

export function suggestionInsertText(item: SuggestItem): string {
  if (item.kind === 'user') return `@${item.ref_key} `;
  if (item.kind === 'requirement') return `#${item.ref_key} `;
  return `[[${item.title}]] `;
}

export default function SuggestionList({ items, active, onPick, onHover, loading, emptyText = 'Sin coincidencias' }: Props) {
  return (
    <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
      {items.length === 0 && <li className="px-3 py-2 text-xs text-[var(--text-muted)]">{loading ? 'Buscando…' : emptyText}</li>}
      {items.map((item, i) => (
        <li
          key={`${item.kind}-${item.id}`}
          role="option"
          aria-selected={i === active}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(item);
          }}
          onMouseEnter={() => onHover(i)}
          className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs ${i === active ? 'bg-[var(--accent-soft)]' : ''}`}
        >
          {item.kind === 'requirement' && <GitCommit className="h-3.5 w-3.5 text-[var(--accent-text)] shrink-0" />}
          {item.kind === 'document' && <FileText className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
          {item.kind === 'user' && <User className="h-3.5 w-3.5 text-sky-500 shrink-0" />}
          {item.kind !== 'document' && item.ref_key && (
            <span className="font-mono font-semibold text-[var(--accent-text)] shrink-0">{item.kind === 'user' ? `@${item.ref_key}` : item.ref_key}</span>
          )}
          <span className="truncate text-[var(--text-primary)]">{item.title}</span>
          {item.subtitle && (
            <span className="ml-auto shrink-0 text-[10px] text-[var(--text-muted)]">
              {item.kind === 'document' ? DOC_TYPE_LABELS[item.subtitle] ?? item.subtitle : item.subtitle}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
