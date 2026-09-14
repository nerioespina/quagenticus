import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { Kbd } from '../ui/misc';

const GROUPS: { title: string; items: [string[], string][] }[] = [
  { title: 'General', items: [[['Ctrl/⌘', 'K'], 'Paleta de comandos y búsqueda'], [['C'], 'Crear requerimiento'], [['?'], 'Mostrar esta ayuda']] },
  {
    title: 'Tablero (con el ratón sobre una tarjeta)',
    items: [[['Enter'], 'Abrir panel rápido'], [['Shift', 'Enter'], 'Abrir requerimiento completo'], [['E'], 'Edición rápida'], [['Espacio'], 'Unirme / salir'], [['←', '→'], 'Mover a la columna anterior/siguiente']],
  },
  { title: 'Editores', items: [[['Ctrl/⌘', 'Enter'], 'Enviar comentario'], [['#'], 'Referenciar requerimiento'], [['[['], 'Enlazar documento'], [['@'], 'Mencionar persona']] },
];

export default function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '?' && !t.closest('input, textarea, select, [contenteditable="true"]')) setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Atajos de teclado" className="max-w-lg">
      <div className="space-y-4">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h4 className="section-title mb-2">{g.title}</h4>
            <ul className="space-y-1.5">
              {g.items.map(([keys, label]) => (
                <li key={label} className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  {label}
                  <span className="flex gap-1">{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
