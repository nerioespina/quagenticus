import { Link } from 'react-router-dom';
import { AlarmClock, AtSign, Bell, CalendarClock, ClipboardList, PenLine } from 'lucide-react';
import { AvatarStack } from '../components/ui/Avatar';
import { Badge, EmptyState, Skeleton } from '../components/ui/misc';
import { useMyWork } from '../hooks/useSearch';
import type { WorkItem } from '../lib/api';
import { dueState, formatDate, formatRelative } from '../lib/dates';

function Section({ title, icon, items, empty }: { title: string; icon: React.ReactNode; items: WorkItem[]; empty: string }) {
  return (
    <section className="card p-4 space-y-2">
      <h3 className="section-title">{icon}{title}<span className="font-mono text-[10px]">{items.length}</span></h3>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] italic">{empty}</p>
      ) : (
        <ul className="divide-y divide-[var(--border-color)]">
          {items.map((r) => {
            const due = dueState(r.due_date, r.status_is_closed);
            return (
              <li key={r.id}>
                <Link to={`/spaces/${r.space_id}/requirements/${r.id}`} className="flex items-center gap-2 py-2 min-w-0 hover:bg-[var(--bg-surface-hover)] rounded-md px-1">
                  <span className="font-mono text-[11px] text-[var(--accent-text)] shrink-0">{r.ref_key}</span>
                  <span className="text-xs text-[var(--text-primary)] truncate flex-1">{r.title}</span>
                  {r.due_date && (
                    <span className={`text-[10px] shrink-0 ${due === 'overdue' ? 'text-rose-500 font-semibold' : due === 'soon' ? 'text-amber-600' : 'text-[var(--text-muted)]'}`}>
                      {formatDate(r.due_date, { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  <Badge color={r.status_color} className="shrink-0">{r.status_name}</Badge>
                  <span className="hidden sm:block shrink-0"><AvatarStack members={r.members} size={18} /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function MyWork() {
  const { data, isLoading } = useMyWork();
  if (isLoading || !data) return <div className="p-6 grid md:grid-cols-2 gap-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-40" />)}</div>;
  const nothing = !data.assigned.length && !data.reported.length && !data.watching.length && !data.mentions.length;
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl">
      <h2 className="text-lg font-bold text-[var(--text-primary)]">Mi trabajo</h2>
      {nothing && <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Nada pendiente" description="Aquí verás lo que tienes asignado, lo que vence y dónde te mencionan." />}
      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Vencidos" icon={<AlarmClock className="h-3.5 w-3.5 text-rose-500" />} items={data.overdue} empty="Nada vencido. ¡Bien!" />
        <Section title="Vencen esta semana" icon={<CalendarClock className="h-3.5 w-3.5 text-amber-500" />} items={data.due_soon} empty="Nada vence en los próximos 7 días." />
        <Section title="Asignados a mí" icon={<ClipboardList className="h-3.5 w-3.5" />} items={data.assigned} empty="No tienes requerimientos abiertos asignados." />
        <section className="card p-4 space-y-2">
          <h3 className="section-title"><AtSign className="h-3.5 w-3.5" />Menciones recientes</h3>
          {data.mentions.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] italic">Nadie te ha mencionado.</p>
          ) : (
            <ul className="divide-y divide-[var(--border-color)]">
              {data.mentions.map((m) => (
                <li key={m.id} className="py-2 text-xs">
                  <Link
                    to={`/spaces/${String(m.payload.space_id)}/${m.payload.doc_type === 'requirement' ? 'requirements' : 'docs'}/${m.document_id}${m.journal_id ? `?tab=comments#comment-${m.journal_id}` : ''}`}
                    className={`block hover:underline ${m.read_at ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}
                  >
                    <span className="font-mono text-[var(--accent-text)]">{String(m.payload.ref_key ?? '')}</span> {String(m.payload.title ?? '')}
                    {typeof m.payload.excerpt === 'string' && <span className="block text-[var(--text-muted)] truncate">{m.payload.excerpt}</span>}
                    <span className="text-[10px] text-[var(--text-muted)]">{formatRelative(m.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Section title="Reportados por mí" icon={<PenLine className="h-3.5 w-3.5" />} items={data.reported} empty="No has reportado requerimientos abiertos." />
        <Section title="Siguiendo" icon={<Bell className="h-3.5 w-3.5" />} items={data.watching} empty="No sigues otros requerimientos." />
      </div>
    </div>
  );
}
