import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import Modal from '../ui/Modal';
import { Tabs } from '../ui/misc';
import SuggestionList, { suggestionInsertText } from './SuggestionList';
import { useSuggest } from '../../hooks/useSearch';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  onInsert: (text: string) => void;
  excludeId?: string;
}

/** Searchable picker to insert #REQ or [[Document]] references. */
export default function InsertReferenceModal({ isOpen, onClose, spaceId, onInsert, excludeId }: Props) {
  const [tab, setTab] = useState<'requirement' | 'document'>('requirement');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 150);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setActive(0), [debounced, tab]);

  const { data = [], isFetching } = useSuggest(spaceId, debounced, [tab], isOpen);
  const items = data.filter((i) => i.id !== excludeId);

  const pick = (i = active) => {
    const item = items[i];
    if (!item) return;
    onInsert(suggestionInsertText(item));
    setQ('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Insertar referencia" className="max-w-lg">
      <div className="space-y-3">
        <Tabs
          tabs={[
            { id: 'requirement', label: 'Requerimientos' },
            { id: 'document', label: 'Documentos' },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                pick();
              }
            }}
            placeholder={tab === 'requirement' ? 'Número, clave o título…' : 'Título del documento…'}
            className="input pl-8"
          />
        </div>
        <div className="border border-[var(--border-color)] rounded-lg">
          <SuggestionList items={items} active={active} onHover={setActive} onPick={(it) => pick(items.indexOf(it))} loading={isFetching} />
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">
          También puedes escribir <code>#</code> o <code>@123</code> para requerimientos, <code>[[</code> para documentos y <code>@</code> para personas.
        </p>
      </div>
    </Modal>
  );
}
