import React from 'react';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  FileCode,
  Quote,
  Link as LinkIcon,
  Table as TableIcon,
} from 'lucide-react';

export interface ToolbarAction {
  label: string;
  prefix: string;
  suffix: string;
  defaultText: string;
}

interface MarkdownToolbarProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onValueChange?: (newValue: string) => void;
  onCustomAction?: (action: ToolbarAction) => void;
  className?: string;
}

export function insertIntoTextarea(
  textarea: HTMLTextAreaElement,
  prefix: string,
  suffix = '',
  defaultText = '',
  onValueChange?: (newValue: string) => void
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selection = textarea.value.substring(start, end) || defaultText;
  const replacement = `${prefix}${selection}${suffix}`;

  const newValue =
    textarea.value.substring(0, start) +
    replacement +
    textarea.value.substring(end);

  if (onValueChange) {
    onValueChange(newValue);
  } else {
    textarea.value = newValue;
  }

  setTimeout(() => {
    textarea.focus();
    const newCursorPos = start + prefix.length + selection.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
  }, 0);
}

export default function MarkdownToolbar({
  textareaRef,
  onValueChange,
  onCustomAction,
  className = '',
}: MarkdownToolbarProps) {
  const handleAction = (action: ToolbarAction) => {
    if (onCustomAction) {
      onCustomAction(action);
      return;
    }
    if (textareaRef?.current) {
      insertIntoTextarea(
        textareaRef.current,
        action.prefix,
        action.suffix,
        action.defaultText,
        onValueChange
      );
    }
  };

  const btn = (
    icon: React.ReactNode,
    title: string,
    prefix: string,
    suffix = '',
    defaultText = ''
  ) => (
    <button
      type="button"
      title={title}
      onClick={() => handleAction({ label: title, prefix, suffix, defaultText })}
      className="p-1.5 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-100 transition-colors"
    >
      {icon}
    </button>
  );

  return (
    <div
      className={`flex flex-wrap items-center gap-0.5 px-2 py-1 bg-slate-800/80 border border-slate-700/70 rounded-t-lg text-slate-300 ${className}`}
    >
      {btn(<Bold className="h-4 w-4" />, 'Negrita', '**', '**', 'negrita')}
      {btn(<Italic className="h-4 w-4" />, 'Cursiva', '*', '*', 'cursiva')}
      <div className="h-4 w-px bg-slate-700 mx-1" />
      {btn(<Heading1 className="h-4 w-4" />, 'Título 1', '# ', '', 'Título 1')}
      {btn(<Heading2 className="h-4 w-4" />, 'Título 2', '## ', '', 'Título 2')}
      {btn(<Heading3 className="h-4 w-4" />, 'Título 3', '### ', '', 'Título 3')}
      {btn(<Heading4 className="h-4 w-4" />, 'Título 4', '#### ', '', 'Título 4')}
      <div className="h-4 w-px bg-slate-700 mx-1" />
      {btn(<List className="h-4 w-4" />, 'Viñetas', '- ', '', 'ítem')}
      {btn(<ListOrdered className="h-4 w-4" />, 'Lista numerada', '1. ', '', 'ítem')}
      {btn(<CheckSquare className="h-4 w-4" />, 'Lista de tareas', '- [ ] ', '', 'tarea')}
      <div className="h-4 w-px bg-slate-700 mx-1" />
      {btn(<Code className="h-4 w-4" />, 'Código inline', '`', '`', 'code')}
      {btn(<FileCode className="h-4 w-4" />, 'Bloque de código', '```\n', '\n```', 'código')}
      {btn(<Quote className="h-4 w-4" />, 'Cita', '> ', '', 'cita')}
      {btn(<LinkIcon className="h-4 w-4" />, 'Enlace', '[', '](https://)', 'título')}
      {btn(
        <TableIcon className="h-4 w-4" />,
        'Tabla',
        '| Col 1 | Col 2 |\n| --- | --- |\n| ',
        ' | Dato 2 |',
        'Dato 1'
      )}
    </div>
  );
}
