import { create } from 'zustand';
import Modal from './Modal';

interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** When set, the dialog asks for text input (e.g. a resolution). */
  input?: { label: string; placeholder?: string; required?: boolean; multiline?: boolean };
}

interface ConfirmState {
  options: ConfirmOptions | null;
  value: string;
  resolve: ((v: string | false) => void) | null;
  setValue: (v: string) => void;
}

const useConfirmStore = create<ConfirmState>((set) => ({ options: null, value: '', resolve: null, setValue: (value) => set({ value }) }));

/** Promise-based confirmation. Resolves to false when cancelled, or the input value ('' without input). */
export function confirmDialog(options: ConfirmOptions): Promise<string | false> {
  return new Promise((resolve) => useConfirmStore.setState({ options, resolve, value: '' }));
}

export function ConfirmHost() {
  const { options, resolve, value, setValue } = useConfirmStore();
  if (!options) return null;
  const finish = (v: string | false) => {
    resolve?.(v);
    useConfirmStore.setState({ options: null, resolve: null, value: '' });
  };
  const blocked = !!options.input?.required && !value.trim();
  return (
    <Modal
      isOpen
      onClose={() => finish(false)}
      title={options.title}
      className="max-w-md"
      footer={
        <>
          <button type="button" onClick={() => finish(false)} className="btn-secondary">Cancelar</button>
          <button
            type="button"
            disabled={blocked}
            onClick={() => finish(value)}
            className={options.danger ? 'btn-danger' : 'btn-primary'}
          >
            {options.confirmLabel ?? 'Confirmar'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocked) finish(value);
        }}
        className="space-y-3"
      >
        {options.message && <div className="text-sm text-[var(--text-secondary)]">{options.message}</div>}
        {options.input && (
          <label className="block space-y-1">
            <span className="field-label">{options.input.label}</span>
            {options.input.multiline ? (
              <textarea autoFocus rows={3} value={value} onChange={(e) => setValue(e.target.value)} placeholder={options.input.placeholder} className="input" />
            ) : (
              <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={options.input.placeholder} className="input" />
            )}
          </label>
        )}
      </form>
    </Modal>
  );
}
