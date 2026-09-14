import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Notification } from '../lib/api';
import { qk } from '../lib/queryKeys';

export function useNotificationCount() {
  return useQuery({
    queryKey: qk.notifications.count,
    queryFn: () => api.get<{ unread: number }>('/notifications/count'),
    refetchInterval: 60_000,
  });
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: qk.notifications.list,
    queryFn: () => api.get<Notification[]>('/notifications?limit=50'),
    enabled,
  });
}

export function useNotificationMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: qk.notifications.all });
  return {
    read: useMutation({ mutationFn: (id: string) => api.post(`/notifications/${id}/read`), onSuccess: done }),
    readAll: useMutation({
      mutationFn: (documentId?: string) => api.post(`/notifications/read-all${documentId ? `?document_id=${documentId}` : ''}`),
      onSuccess: done,
    }),
  };
}
