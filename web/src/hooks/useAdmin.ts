import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Agent, Priority, QueueItem, Tracker, Transition, WorkflowStatus } from '../lib/api';
import { qk } from '../lib/queryKeys';

export function useAdminCatalogMutations() {
  const qc = useQueryClient();
  const refreshStatuses = () => qc.invalidateQueries({ queryKey: qk.catalogs.statuses }).then(() => qc.invalidateQueries({ queryKey: ['space'] }));
  const refreshTrackers = () => qc.invalidateQueries({ queryKey: qk.catalogs.trackers });
  const refreshPriorities = () => qc.invalidateQueries({ queryKey: qk.catalogs.priorities });
  return {
    saveStatus: useMutation({
      mutationFn: ({ id, ...data }: Partial<WorkflowStatus> & { id?: string }) =>
        id ? api.patch<WorkflowStatus>(`/admin/statuses/${id}`, data) : api.post<WorkflowStatus>('/admin/statuses', data),
      onSuccess: refreshStatuses,
    }),
    deleteStatus: useMutation({ mutationFn: (id: string) => api.delete(`/admin/statuses/${id}`), onSuccess: refreshStatuses }),
    reorderStatuses: useMutation({ mutationFn: (ids: string[]) => api.put('/admin/statuses/order', { ids }), onSuccess: refreshStatuses }),
    saveTracker: useMutation({
      mutationFn: ({ id, ...data }: Partial<Tracker> & { id?: string }) =>
        id ? api.patch<Tracker>(`/admin/trackers/${id}`, data) : api.post<Tracker>('/admin/trackers', data),
      onSuccess: refreshTrackers,
    }),
    savePriority: useMutation({
      mutationFn: ({ id, ...data }: Partial<Priority> & { id?: string }) =>
        id ? api.patch<Priority>(`/admin/priorities/${id}`, data) : api.post<Priority>('/admin/priorities', data),
      onSuccess: refreshPriorities,
    }),
  };
}

export function useTransitions(trackerId: string) {
  return useQuery({
    queryKey: qk.admin.transitions(trackerId),
    queryFn: () => api.get<Transition[]>(`/admin/trackers/${trackerId}/transitions`),
    enabled: !!trackerId,
  });
}

export function useReplaceTransitions(trackerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules: Omit<Transition, 'id' | 'tracker_id'>[]) => api.put(`/admin/trackers/${trackerId}/transitions`, { rules }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin.transitions(trackerId) }),
  });
}

export function useAgents() {
  return useQuery({ queryKey: qk.admin.agents, queryFn: () => api.get<Agent[]>('/admin/agents') });
}

export function useAgentMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: qk.admin.agents });
  return {
    create: useMutation({ mutationFn: (data: { name: string; description?: string; model_name?: string }) => api.post<Agent>('/admin/agents', data), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, ...data }: Partial<Agent> & { id: string }) => api.patch<Agent>(`/admin/agents/${id}`, data), onSuccess: done }),
    rotate: useMutation({ mutationFn: (id: string) => api.post<Agent>(`/admin/agents/${id}/rotate-key`), onSuccess: done }),
  };
}

export function useAgentQueue(spaceId: string) {
  return useQuery({ queryKey: qk.space(spaceId).agentQueue, queryFn: () => api.get<QueueItem[]>(`/spaces/${spaceId}/agent-queue`), enabled: !!spaceId });
}
