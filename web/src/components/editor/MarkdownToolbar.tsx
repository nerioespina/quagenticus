import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered, CheckSquare, Code, FileCode, Quote, Link as LinkIcon, Table as TableIcon,
  AtSign, Paperclip, Strikethrough,
} from 'lucide-react';

export interface ToolbarAction {
  label: string;
  prefix: string;
  suffix: string;
  defaultText: string;
  block?: boolean;
}

export const TOOLBAR_ACTIONS: (ToolbarAction & { icon: React.ReactNode } | 'sep')[] = [
  { label: 'Negrita', prefix: '**', suffix: '**', defaultText: 'negrita', icon: <Bold className="h-4 w-4" /> },
  { label: 'Cursiva', prefix: '*', suffix: '*', defaultText: 'cursiva', icon: <Italic className="h-4 w-4" /> },
  { label: 'Tachado', prefix: '~~', suffix: '~~', defaultText: 'texto', icon: <Strikethrough className="h-4 w-4" /> },
  'sep',
  { label: 'Título 2', prefix: '## ', suffix: '', defaultText: 'Título', block: true, icon: <Heading2 className="h-4 w-4" /> },
  { label: 'Título 3', prefix: '### ', suffix: '', defaultText: 'Título', block: true, icon: <Heading3 className="h-4 w-4" /> },
  'sep',
  { label: 'Viñetas', prefix: '- ', suffix: '', defaultText: 'ítem', block: true, icon: <List className="h-4 w-4" /> },
  { label: 'Lista numerada', prefix: '1. ', suffix: '', defaultText: 'ítem', block: true, icon: <ListOrdered className="h-4 w-4" /> },
  { label: 'Lista de tareas', prefix: '- [ ] ', suffix: '', defaultText: 'tarea', block: true, icon: <CheckSquare className="h-4 w-4" /> },
  'sep',
  { label: 'Código', prefix: '`', suffix: '`', defaultText: 'code', icon: <Code className="h-4 w-4" /> },
  { label: 'Bloque de código', prefix: '```\n', suffix: '\n```', defaultText: 'código', block: true, icon: <FileCode className="h-4 w-4" /> },
  { label: 'Cita', prefix: '> ', suffix: '', defaultText: 'cita', block: true, icon: <Quote className="h-4 w-4" /> },
  { label: 'Enlace', prefix: '[', suffix: '](https://)', defaultText: 'texto', icon: <LinkIcon className="h-4 w-4" /> },
  {
    label: 'Tabla', prefix: '| Columna 1 | Columna 2 |\n| --- | --- |\n| ', suffix: ' | valor |', defaultText: 'valor', block: true,
    icon: <TableIcon className="h-4 w-4" />,
  },
];

/** Applies an action to a text value at the given selection. */
export function applyAction(value: string, start: number, end: number, action: ToolbarAction) {
  const selection = value.slice(start, end) || action.defaultText;
  const needsNewline = action.block && start > 0 && value[start - 1] !== '\n';
  const prefix = (needsNewline ? '\n' : '') + action.prefix;
  const next = value.slice(0, start) + prefix + selection + action.suffix + value.slice(end);
  const selStart = start + prefix.length;
  return { value: next, selStart, selEnd: selStart + selection.length };
}

interface Props {
  onAction: (action: ToolbarAction) => void;
  onInsertReference?: () => void;
  onAttach?: () => void;
  className?: string;
  extra?: React.ReactNode;
}

export default function MarkdownToolbar({ onAction, onInsertReference, onAttach, className = '', extra }: Props) {
  return (
    <div className={`flex flex-wrap items-center gap-0.5 px-1.5 py-1 bg-[var(--bg-surface-hover)] border-b border-[var(--border-color)] ${className}`}>
      {TOOLBAR_ACTIONS.map((a, i) =>
        a === 'sep' ? (
          <span key={i} className="h-4 w-px bg-[var(--border-color)] mx-1" />
        ) : (
          <button
            key={a.label}
            type="button"
            title={a.label}
            aria-label={a.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAction(a)}
            className="p-1.5 rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            {a.icon}
          </button>
        ),
      )}
      {(onInsertReference || onAttach) && <span className="h-4 w-px bg-[var(--border-color)] mx-1" />}
      {onInsertReference && (
        <button
          type="button"
          onClick={onInsertReference}
          title="Insertar referencia a requerimiento o documento"
          className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-[var(--bg-surface)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <AtSign className="h-4 w-4" /> Referencia
        </button>
      )}
      {onAttach && (
        <button
          type="button"
          onClick={onAttach}
          title="Adjuntar archivos"
          className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-[var(--bg-surface)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <Paperclip className="h-4 w-4" /> Adjuntar
        </button>
      )}
      {extra && <div className="ml-auto flex items-center gap-1">{extra}</div>}
    </div>
  );
}
