import { CheckCircle2, Circle } from 'lucide-react';
import type { Requirement } from '../../lib/api';

export default function ReadinessCard({ req }: { req: Requirement }) {
  const score = req.readiness_score ?? 0;
  const criteria = req.readiness_report?.criteria ?? [];
  const tone = score >= 100 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="section-title">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          Definition of Ready
        </span>
        <span className="text-xs font-mono font-bold text-[var(--text-primary)]">{req.readiness_score != null ? `${score}%` : '—'}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--bg-surface-hover)] overflow-hidden">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${score}%` }} />
      </div>
      {criteria.length > 0 && (
        <ul className="space-y-1">
          {criteria.map((c) => (
            <li key={c.key} className={`flex items-center gap-1.5 text-[11px] ${c.passed ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}`}>
              {c.passed ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" /> : <Circle className="h-3 w-3 shrink-0" />}
              <span className={c.passed ? 'line-through' : ''}>{c.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
