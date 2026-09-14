import { useMemo } from 'react';
import { ArrowRight, Bot, History } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { EmptyState, LabelChip, Spinner } from '../ui/misc';
import Markdown from '../markdown/Markdown';
import { useJournals } from '../../hooks/useJournals';
import { useCatalogMaps, useCategories, useMilestones } from '../../hooks/useCatalogs';
import type { Journal, JournalDetail } from '../../lib/api';
import { ATTRIBUTE_LABELS, LINK_TYPE_LABELS } from '../../lib/i18n';
import { formatDate, formatDateTime, formatRelative } from '../../lib/dates';

function Value({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>;
}

function useNamer(spaceId: string) {
  const { statusById, priorityById, trackerById } = useCatalogMaps();
  const { data: categories = [] } = useCategories(spaceId);
  const { data: milestones = [] } = useMilestones(spaceId);
  return (property: string | undefined, v: unknown): string => {
    if (v === null || v === undefined || v === '') return 'vacío';
    const s = String(v);
    switch (property) {
      case 'status_id': return statusById[s]?.name ?? '—';
      case 'priority_id': return priorityById[s]?.name ?? '—';
      case 'tracker_id': return trackerById[s]?.name ?? '—';
      case 'category_id': return categories.find((c) => c.id === s)?.name ?? '—';
      case 'milestone_id': return milestones.find((m) => m.id === s)?.name ?? '—';
      case 'done_ratio': return `${s}%`;
      case 'estimated_hours':
      case 'spent_hours': return `${s} h`;
      case 'start_date':
      case 'due_date': return formatDate(s);
      default: return s;
    }
  };
}

function DetailLine({ d, name }: { d: JournalDetail; name: (p: string | undefined, v: unknown) => string }) {
  switch (d.type) {
    case 'created': return <>creó el requerimiento</>;
    case 'status_changed':
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          movió de <Value>{name('status_id', d.from)}</Value> <ArrowRight className="h-3 w-3" /> <Value>{name('status_id', d.to)}</Value>
          {typeof d.resolution === 'string' && <> · resolución: <Value>{d.resolution}</Value></>}
        </span>
      );
    case 'attr':
      if (d.property === 'body_md') return <>editó la descripción <span className="text-[var(--text-muted)]">(v{String(d.from_version)} → v{String(d.to_version)})</span></>;
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          cambió {ATTRIBUTE_LABELS[d.property ?? ''] ?? d.property} de <Value>{name(d.property, d.from)}</Value> a <Value>{name(d.property, d.to)}</Value>
        </span>
      );
    case 'member_added': return <>asignó a <Value>{String(d.user_name ?? '')}</Value></>;
    case 'member_removed': return <>quitó a <Value>{String(d.user_name ?? '')}</Value></>;
    case 'lead_changed': return d.to ? <>nombró responsable a <Value>{String(d.user_name ?? '')}</Value></> : <>quitó al responsable</>;
    case 'label_added': return <span className="inline-flex items-center gap-1">añadió la etiqueta <LabelChip name={String(d.label_name)} color={String(d.color)} /></span>;
    case 'label_removed': return <span className="inline-flex items-center gap-1">quitó la etiqueta <LabelChip name={String(d.label_name)} color={String(d.color)} /></span>;
    case 'attachment_added': return <>adjuntó <Value>{String(d.filename)}</Value></>;
    case 'attachment_removed': return <>eliminó el adjunto <Value>{String(d.filename)}</Value></>;
    case 'link_added': return <>enlazó <Value>{String(d.target_title)}</Value> ({LINK_TYPE_LABELS[String(d.link_type)] ?? String(d.link_type)})</>;
    case 'link_removed': return <>quitó el enlace con <Value>{String(d.target_title)}</Value></>;
    case 'time_logged': return <>registró <Value>{String(d.hours)} h</Value></>;
    case 'claimed': return <>reclamó el requerimiento (lease hasta {formatDateTime(String(d.expires_at))})</>;
    case 'released': return <>liberó el reclamo (<Value>{String(d.state)}</Value>)</>;
    case 'archived': return <>archivó el documento</>;
    case 'restored': return <>restauró el documento</>;
    case 'cloned_from': return <>se creó como copia de <Value>{String(d.ref_key)}</Value></>;
    case 'moved_space': return <>movió de <Value>{String(d.from_ref)}</Value> a <Value>{String(d.to_ref)}</Value></>;
    case 'promoted': return <>convirtió la nota en requerimiento <Value>{String(d.ref_key)}</Value></>;
    default: return <>{d.type}</>;
  }
}

interface Group {
  key: string;
  first: Journal;
  entries: Journal[];
}

/** History of changes, grouping consecutive entries of the same actor within 2 minutes. */
export default function ActivityTimeline({ docId, spaceId }: { docId: string; spaceId: string }) {
  const { data: journals = [], isLoading } = useJournals(docId, 'history');
  const name = useNamer(spaceId);

  const groups = useMemo(() => {
    const out: Group[] = [];
    for (const j of journals) {
      const last = out[out.length - 1];
      const prev = last?.entries[last.entries.length - 1];
      if (last && prev && prev.actor_id === j.actor_id && !j.notes_md && !prev.notes_md &&
          new Date(j.created_at).getTime() - new Date(prev.created_at).getTime() < 120_000) {
        last.entries.push(j);
      } else {
        out.push({ key: j.id, first: j, entries: [j] });
      }
    }
    return out.reverse();
  }, [journals]);

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (groups.length === 0) return <EmptyState icon={<History className="h-6 w-6" />} title="Sin historial todavía" />;

  return (
    <ol className="relative border-l border-[var(--border-color)] ml-3 space-y-4">
      {groups.map((g) => (
        <li key={g.key} className="ml-5">
          <span className="absolute -left-3 mt-0.5">
            <Avatar name={g.first.actor_name} url={g.first.actor_avatar_url} size={22} agent={g.first.actor_type === 'agent'} className="ring-2 ring-[var(--bg-page)]" />
          </span>
          <div className="text-xs text-[var(--text-secondary)] space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-[var(--text-primary)]">{g.first.actor_name}</span>
              {g.first.actor_type === 'agent' && <Bot className="h-3 w-3 text-violet-500" />}
              <time title={formatDateTime(g.first.created_at)} className="text-[var(--text-muted)]">{formatRelative(g.first.created_at)}</time>
            </div>
            <ul className="space-y-0.5">
              {g.entries.flatMap((e) =>
                e.details.map((d, i) => (
                  <li key={`${e.id}-${i}`}>
                    <DetailLine d={d} name={name} />
                  </li>
                )),
              )}
            </ul>
            {g.entries.map((e) => e.notes_md && (
              <div key={`${e.id}-note`} className="mt-1 p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)]">
                <Markdown content={e.notes_md} spaceId={spaceId} className="text-xs" />
              </div>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
