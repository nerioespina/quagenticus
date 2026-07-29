import React, { useState } from 'react';
import Modal from './Modal';
import { useDocuments } from '../hooks/useDocuments';
import { Search, Link as LinkIcon } from 'lucide-react';

interface LinkDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  currentReqId: string;
  onLink: (target_id: string, link_type: string, note?: string) => void;
  filterType?: 'requirement' | 'all';
}

export default function LinkDocumentModal({
  isOpen,
  onClose,
  spaceId,
  currentReqId,
  onLink,
  filterType = 'all',
}: LinkDocumentModalProps) {
  const { data: docs = [], isLoading } = useDocuments(spaceId);
  const [search, setSearch] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [linkType, setLinkType] = useState<string>('relates');
  const [note, setNote] = useState('');

  const filteredDocs = docs.filter((d) => {
    if (d.id === currentReqId) return false;
    if (filterType === 'requirement' && d.doc_type !== 'requirement') return false;
    if (search && !d.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocId) return;
    onLink(selectedDocId, linkType, note ? note : undefined);
    setSelectedDocId('');
    setNote('');
    onClose();
  };

  const linkOptions =
    filterType === 'requirement'
      ? [
          { value: 'blocks', label: 'Bloquea a' },
          { value: 'blocked_by', label: 'Bloqueado por' },
          { value: 'relates', label: 'Se relaciona con' },
          { value: 'duplicates', label: 'Duplica a' },
          { value: 'duplicated_by', label: 'Duplicado por' },
          { value: 'precedes', label: 'Precede a' },
          { value: 'follows', label: 'Sigue a' },
        ]
      : [
          { value: 'relates', label: 'Se relaciona con' },
          { value: 'specifies', label: 'Especifica' },
          { value: 'implements', label: 'Implementa' },
          { value: 'blocks', label: 'Bloquea a' },
        ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={filterType === 'requirement' ? 'Vincular Requerimiento' : 'Vincular Documento'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Tipo de relación
          </label>
          <select
            value={linkType}
            onChange={(e) => setLinkType(e.target.value)}
            className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            {linkOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Buscar y seleccionar {filterType === 'requirement' ? 'requerimiento' : 'documento'}
          </label>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Escribe para buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md bg-slate-800 border border-slate-700 pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="max-h-48 overflow-y-auto border border-slate-700 rounded-md bg-slate-900/60 divide-y divide-slate-800">
            {isLoading ? (
              <p className="p-3 text-xs text-slate-400 text-center">Cargando lista...</p>
            ) : filteredDocs.length === 0 ? (
              <p className="p-3 text-xs text-slate-400 text-center">No se encontraron resultados.</p>
            ) : (
              filteredDocs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => setSelectedDocId(doc.id)}
                  className={`flex items-center justify-between p-2 cursor-pointer transition-colors ${
                    selectedDocId === doc.id
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <LinkIcon className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                    <span className="text-xs font-medium truncate">{doc.title}</span>
                  </div>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                    {doc.doc_type}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Nota o comentario (opcional)
          </label>
          <input
            type="text"
            placeholder="Añade un comentario sobre este enlace..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-300 hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!selectedDocId}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Vincular
          </button>
        </div>
      </form>
    </Modal>
  );
}
