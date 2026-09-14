import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, session } from './api';
import { qk } from './queryKeys';
import { useAuth } from './auth';

interface ChangeEvent {
  type: string;
  space_id: string;
  document_id?: string | null;
}

/**
 * Subscribes to server-sent change events and invalidates the affected caches,
 * so boards, lists and detail pages stay in sync across users.
 */
export function useLiveEvents() {
  const qc = useQueryClient();
  const status = useAuth((s) => s.status);

  useEffect(() => {
    if (status !== 'authenticated' || typeof EventSource === 'undefined') return;
    let source: EventSource | null = null;
    let closed = false;
    let pending = new Map<string, ChangeEvent>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      const events = [...pending.values()];
      pending = new Map();
      const spaces = new Set<string>();
      for (const ev of events) {
        if (ev.type === 'notification') {
          qc.invalidateQueries({ queryKey: qk.notifications.all });
          qc.invalidateQueries({ queryKey: qk.myWork });
          continue;
        }
        spaces.add(ev.space_id);
        if (ev.document_id) {
          qc.invalidateQueries({ queryKey: qk.requirement(ev.document_id).all });
          qc.invalidateQueries({ queryKey: qk.document(ev.document_id).all });
        }
      }
      for (const s of spaces) {
        qc.invalidateQueries({ queryKey: [...qk.space(s).all, 'board'] });
        qc.invalidateQueries({ queryKey: [...qk.space(s).all, 'requirements'] });
        qc.invalidateQueries({ queryKey: [...qk.space(s).all, 'documents'] });
        qc.invalidateQueries({ queryKey: qk.space(s).agentQueue });
      }
    };

    const connect = () => {
      if (closed || !session.token) return;
      source = new EventSource(api.eventsUrl());
      source.addEventListener('change', (e) => {
        try {
          const ev = JSON.parse((e as MessageEvent).data) as ChangeEvent;
          pending.set(`${ev.type}:${ev.space_id}:${ev.document_id ?? ''}`, ev);
          if (!timer) timer = setTimeout(flush, 400);
        } catch {
          /* ignore malformed events */
        }
      });
      source.onerror = () => {
        source?.close();
        // the access token may have expired: refresh and reconnect
        setTimeout(() => session.refresh().then(connect), 5000);
      };
    };
    connect();
    const unsubscribe = session.subscribe(() => {
      source?.close();
      connect();
    });

    return () => {
      closed = true;
      unsubscribe();
      source?.close();
      if (timer) clearTimeout(timer);
    };
  }, [status, qc]);
}
