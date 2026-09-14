import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { badgeStyle, labelStyle } from '../../lib/colors';

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={`animate-spin text-[var(--text-muted)] ${className}`} aria-label="Cargando" />;
}

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[var(--bg-surface-hover)] ${className}`} />;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 p-10 border border-dashed border-[var(--border-color)] rounded-xl">
      {icon && <div className="text-[var(--text-muted)]">{icon}</div>}
      <p className="text-sm font-semibold text-[var(--text-secondary)]">{title}</p>
      {description && <p className="text-xs text-[var(--text-muted)] max-w-md">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Badge({ color, children, className = '', title }: { color?: string | null; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} style={badgeStyle(color)} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-semibold whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

export function LabelChip({ name, color, onRemove, compact }: { name: string; color: string; onRemove?: () => void; compact?: boolean }) {
  if (compact) return <span title={name} style={labelStyle(color)} className="inline-block h-1.5 w-8 rounded-full" />;
  return (
    <span style={labelStyle(color)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold max-w-full">
      <span className="truncate">{name}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Quitar etiqueta ${name}`} className="hover:opacity-70">
          ×
        </button>
      )}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="px-1.5 py-0.5 rounded border border-[var(--border-color)] bg-[var(--bg-surface-hover)] text-[10px] font-mono text-[var(--text-secondary)]">{children}</kbd>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; count?: number; icon?: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex items-center gap-1 border-b border-[var(--border-color)] overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
            value === t.id ? 'border-[var(--accent-color)] text-[var(--accent-text)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t.icon}
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className="px-1.5 rounded-full bg-[var(--bg-surface-hover)] text-[10px] text-[var(--text-muted)]">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

interface BoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-3">
        <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
        <p className="text-sm font-semibold text-[var(--text-primary)]">Algo salió mal al mostrar esta vista.</p>
        <p className="text-xs text-[var(--text-muted)] font-mono break-words">{this.state.error.message}</p>
        <button type="button" className="btn-primary" onClick={() => this.setState({ error: null })}>Reintentar</button>
      </div>
    );
  }
}
