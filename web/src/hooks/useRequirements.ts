import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Requirement } from '../lib/api';

interface ReqFilters {
  status_id?: string;
  priority_id?: string;
}

export function useRequirements(spaceId: string, filters?: ReqFilters) {
  const params = new URLSearchParams();
  if (filters?.status_id) params.set('status_id', filters.status_id);
  if (filters?.priority_id) params.set('priority_id', filters.priority_id);
  const qs = params.toString() ? `?${params.toString()}` : '';

  return useQuery({
    queryKey: ['requirements', spaceId, filters],
    queryFn: () => api.get<Requirement[]>(`/spaces/${spaceId}/requirements${qs}`),
    enabled: !!spaceId,
  });
}

export function useRequirement(id: string) {
  return useQuery({
    queryKey: ['requirement', id],
    queryFn: () => api.get<Requirement>(`/requirements/${id}`),
    enabled: !!id,
  });
}

export function useCreateRequirement(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      tracker_id: string;
      title: string;
      body_md?: string;
      priority_id: string;
      category_id?: string;
    }) => api.post<Requirement>(`/spaces/${spaceId}/requirements`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requirements', spaceId] }),
  });
}

export function useTransitionRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, to_status_id, comment }: { id: string; to_status_id: string; comment?: string }) =>
      api.post<Requirement>(`/requirements/${id}/transition`, { to_status_id, comment }),
    onSuccess: (req) => {
      qc.setQueryData(['requirement', req.id], req);
      qc.invalidateQueries({ queryKey: ['requirements'] });
      qc.invalidateQueries({ queryKey: ['board'] });
    },
  });
}

export function useMoveCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, before_id, after_id }: { id: string; before_id?: string; after_id?: string }) =>
      api.patch<void>(`/requirements/${id}/position`, { before_id, after_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board'] }),
  });
}
