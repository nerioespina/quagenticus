import { useState } from 'react';
import Modal from './Modal';
import { useChangeOwnPassword } from '../hooks/useUsers';
import { Key, Check, Loader2 } from 'lucide-react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  const changeOwnPassword = useChangeOwnPassword();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (newPassword !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    changeOwnPassword.mutate(
      { current_password: currentPassword, new_password: newPassword },
      {
        onSuccess: () => {
          setSuccess(true);
          setTimeout(() => {
            setSuccess(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            onClose();
          }, 1500);
        },
        onError: (err: any) => {
          setErrorMsg(err.message || 'La contraseña actual es incorrecta');
        },
      }
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cambiar mi contraseña">
      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold">
            {errorMsg}
          </div>
        )}
        {success && (
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <Check className="h-4 w-4" /> Contraseña actualizada correctamente
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
            Contraseña Actual
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
            Nueva Contraseña
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
            Confirmar Nueva Contraseña
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] text-xs font-semibold"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={changeOwnPassword.isPending}
            className="px-4 py-2 rounded-lg bg-[var(--accent-color)] text-white text-xs font-semibold hover:bg-[var(--accent-color-hover)] disabled:opacity-50 flex items-center gap-1.5"
          >
            {changeOwnPassword.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
            Actualizar
          </button>
        </div>
      </form>
    </Modal>
  );
}
