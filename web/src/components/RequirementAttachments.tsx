import { useState } from 'react';
import {
  FileText,
  Link as LinkIcon,
  Trash2,
  Download,
  Plus,
  Paperclip,
  GitBranch,
} from 'lucide-react';
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '../hooks/useAttachments';
import {
  useDocumentLinks,
  useCreateDocumentLink,
  useDeleteDocumentLink,
} from '../hooks/useDocumentLinks';
import FileDropZone from './FileDropZone';
import LinkDocumentModal from './LinkDocumentModal';

interface RequirementAttachmentsProps {
  spaceId: string;
  reqId: string;
}

const LINK_TYPE_LABELS: Record<string, string> = {
  relates: 'Se relaciona con',
  specifies: 'Especifica',
  implements: 'Implementa',
  blocks: 'Bloquea a',
  blocked_by: 'Bloqueado por',
  duplicates: 'Duplica a',
  duplicated_by: 'Duplicado por',
  precedes: 'Precede a',
  follows: 'Sigue a',
};

export default function RequirementAttachments({ spaceId, reqId }: RequirementAttachmentsProps) {
  const { data: attachments = [], isLoading: loadingAttach } = useAttachments(reqId);
  const uploadAttach = useUploadAttachment(reqId);
  const deleteAttach = useDeleteAttachment(reqId);

  const { data: links = [], isLoading: loadingLinks } = useDocumentLinks(reqId);
  const createLink = useCreateDocumentLink(reqId);
  const deleteLink = useDeleteDocumentLink(reqId);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalFilter, setModalFilter] = useState<'all' | 'requirement'>('all');

  const handleOpenModal = (filter: 'all' | 'requirement') => {
    setModalFilter(filter);
    setIsModalOpen(true);
  };

  const handleLinkDocument = (target_id: string, link_type: string, note?: string) => {
    createLink.mutate({ target_id, link_type, note });
  };

  const handleUploadFile = (file: File) => {
    uploadAttach.mutate(file);
  };

  const docLinks = links.filter((l) => l.target_type !== 'requirement');
  const reqLinks = links.filter((l) => l.target_type === 'requirement');

  return (
    <div className="space-y-8">
      {/* Knowledge Documents Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--accent-text)]" />
            <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
              Documentos de Conocimiento Vinculados
            </h3>
            <span className="text-xs text-[var(--text-muted)] font-mono">({docLinks.length})</span>
          </div>
          <button
            onClick={() => handleOpenModal('all')}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-[var(--accent-soft)] text-[var(--accent-text)] hover:bg-[var(--accent-color)]/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Vincular Documento
          </button>
        </div>

        {loadingLinks ? (
          <p className="text-xs text-[var(--text-muted)] italic">Cargando enlaces...</p>
        ) : docLinks.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] italic">
            No hay documentos vinculados a este requerimiento.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border-color)] border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--bg-surface)]">
            {docLinks.map((link) => (
              <div
                key={link.id}
                className="flex items-center justify-between p-3 hover:bg-[var(--bg-surface-hover)] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <LinkIcon className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[var(--text-secondary)] truncate">
                        {link.target_title}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent-text)] border border-[var(--accent-color)]/20 shrink-0">
                        {LINK_TYPE_LABELS[link.link_type] || link.link_type}
                      </span>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface-hover)] text-[var(--text-muted)] shrink-0">
                        {link.target_type}
                      </span>
                    </div>
                    {link.note && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 italic">{link.note}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteLink.mutate(link.id)}
                  className="p-1.5 rounded hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-500 transition-colors shrink-0"
                  title="Eliminar enlace"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Requirement Relationships Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-[var(--status-progress-text)]" />
            <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
              Relaciones entre Requerimientos
            </h3>
            <span className="text-xs text-[var(--text-muted)] font-mono">({reqLinks.length})</span>
          </div>
          <button
            onClick={() => handleOpenModal('requirement')}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-[var(--status-progress-bg)] text-[var(--status-progress-text)] hover:bg-[var(--status-progress-bg)]/80 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Relacionar Requerimiento
          </button>
        </div>

        {reqLinks.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] italic">
            No hay otros requerimientos relacionados.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border-color)] border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--bg-surface)]">
            {reqLinks.map((link) => (
              <div
                key={link.id}
                className="flex items-center justify-between p-3 hover:bg-[var(--bg-surface-hover)] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <GitBranch className="h-4 w-4 text-[var(--status-progress-text)] shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[var(--text-secondary)] truncate">
                        {link.target_title}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--status-progress-bg)] text-[var(--status-progress-text)] border border-[var(--status-progress-text)]/20 shrink-0">
                        {LINK_TYPE_LABELS[link.link_type] || link.link_type}
                      </span>
                    </div>
                    {link.note && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 italic">{link.note}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteLink.mutate(link.id)}
                  className="p-1.5 rounded hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-500 transition-colors shrink-0"
                  title="Eliminar relación"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attachments Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Archivos Adjuntos</h3>
            <span className="text-xs text-[var(--text-muted)] font-mono">({attachments.length})</span>
          </div>
        </div>

        <FileDropZone onUpload={handleUploadFile} isUploading={uploadAttach.isPending} />

        {loadingAttach ? (
          <p className="text-xs text-[var(--text-muted)] italic">Cargando archivos...</p>
        ) : attachments.length > 0 ? (
          <div className="divide-y divide-[var(--border-color)] border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--bg-surface)]">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center justify-between p-3 hover:bg-[var(--bg-surface-hover)] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Paperclip className="h-4 w-4 text-emerald-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--text-secondary)] truncate">{att.filename}</p>
                    <p className="text-[10px] text-[var(--text-muted)] font-mono">
                      {(att.byte_size / 1024).toFixed(1)} KB · {att.content_type}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={`/api/v1/attachments/${att.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded hover:bg-[var(--accent-soft)] text-[var(--text-muted)] hover:text-[var(--accent-text)] transition-colors"
                    title="Descargar archivo"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  <button
                    onClick={() => deleteAttach.mutate(att.id)}
                    className="p-1.5 rounded hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-500 transition-colors"
                    title="Eliminar archivo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <LinkDocumentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        spaceId={spaceId}
        currentReqId={reqId}
        onLink={handleLinkDocument}
        filterType={modalFilter}
      />
    </div>
  );
}
