import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Popover from '../ui/Popover';
import { Avatar } from '../ui/Avatar';
import { Spinner } from '../ui/misc';
import { useNotificationCount, useNotificationMutations, useNotifications } from '../../hooks/useNotifications';
import type { Notification } from '../../lib/api';
import { EVENT_LABELS } from '../../lib/i18n';
import { formatRelative } from '../../lib/dates';
import { useState } from 'react';

function href(n: Notification) {
  if (!n.document_id || !n.space_id) return null;
  const base = n.doc_type === 'requirement' ? `/spaces/${n.space_id}/requirements/${n.document_id}` : `/spaces/${n.space_id}/docs/${n.document_id}`;
  if (n.journal_id && (n.event_type === 'commented' || n.event_type === 'mentioned')) return `${base}?tab=comments#comment-${n.journal_id}`;
  return base;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: count } = useNotificationCount();
  const { data: items = [], isLoading } = useNotifications(open);
  const { read, readAll } = useNotificationMutations();
  const unread = count?.unread ?? 0;

  return (
    <Popover
      align="end"
      width={380}
      open={open}
      onOpenChange={setOpen}
      trigger={({ toggle, ref }) => (
        <button ref={ref} type="button" onClick={toggle} aria-label={`Notificaciones (${unread} sin leer)`} className="relative icon-btn p-2">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)]">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Notificaciones</span>
            {unread > 0 && (
              <button type="button" onClick={() => readAll.mutate(undefined)} className="flex items-center gap-1 text-[11px] text-[var(--accent-text)] hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todo como leído
              </button>
            )}
          </div>
          <ul className="max-h-[70vh] overflow-y-auto divide-y divide-[var(--border-color)]">
            {isLoading && <li className="p-4 flex justify-center"><Spinner /></li>}
            {!isLoading && items.length === 0 && <li className="p-6 text-center text-xs text-[var(--text-muted)]">Estás al día.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!n.read_at) read.mutate(n.id);
                    const to = href(n);
                    close();
                    if (to) navigate(to);
                  }}
                  className={`w-full text-left flex gap-2.5 px-3 py-2.5 hover:bg-[var(--bg-surface-hover)] ${n.read_at ? 'opacity-70' : ''}`}
                >
                  <Avatar name={n.actor_name} url={n.actor_avatar_url} size={28} agent={n.actor_type === 'agent'} />
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--text-primary)]">{n.actor_type === 'system' ? 'Recordatorio' : n.actor_name}</span>{' '}
                      {EVENT_LABELS[n.event_type] ?? n.event_type}{' '}
                      <span className="font-mono text-[var(--accent-text)]">{n.ref_key ?? ''}</span> {n.title}
                    </p>
                    {typeof n.payload.excerpt === 'string' && n.payload.excerpt && (
                      <p className="mt-0.5 text-[var(--text-muted)] line-clamp-2">{n.payload.excerpt}</p>
                    )}
                    {typeof n.payload.to === 'string' && <p className="mt-0.5 text-[var(--text-muted)]">→ {n.payload.to}</p>}
                    <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{formatRelative(n.created_at)}</p>
                  </div>
                  {!n.read_at && <span className="mt-1 h-2 w-2 rounded-full bg-[var(--accent-color)] shrink-0" aria-label="sin leer" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Popover>
  );
}
