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
      parent_id?: string;
    }) => api.post<Requirement>(`/spaces/${spaceId}/requirements`, data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['requirements', spaceId] });
      if (variables.parent_id) {
        qc.invalidateQueries({ queryKey: ['requirements', variables.parent_id, 'children'] });
      }
    },
  });
}

export function useUpdateRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      body_md?: string;
      priority_id?: string;
      category_id?: string;
      milestone_id?: string;
      done_ratio?: number;
      estimated_hours?: number;
      spent_hours?: number;
      start_date?: string;
      due_date?: string;
    }) => api.patch<Requirement>(`/requirements/${id}`, data),
    onSuccess: (req) => {
      if (req && req.id) {
        qc.setQueryData(['requirement', req.id], req);
      }
      qc.invalidateQueries({ queryKey: ['requirements'] });
      qc.invalidateQueries({ queryKey: ['board'] });
    },
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

export function useMoveRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      new_status_id,
      before_id,
      after_id,
    }: {
      id: string;
      new_status_id: string;
      before_id?: string;
      after_id?: string;
    }) =>
      api.patch<void>(`/requirements/${id}/move`, {
        new_status_id,
        before_id,
        after_id,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['requirements'] });
    },
  });
}

export function useRequirementChildren(reqId: string) {
  return useQuery({
    queryKey: ['requirements', reqId, 'children'],
    queryFn: () => api.get<Requirement[]>(`/requirements/${reqId}/children`),
    enabled: !!reqId,
  });
}

export function useRequirementLabels(reqId: string) {
  return useQuery({
    queryKey: ['requirements', reqId, 'labels'],
    queryFn: () => api.get<{ id: string; name: string; color: string }[]>(`/requirements/${reqId}/labels`),
    enabled: !!reqId,
  });
}

export function useAddRequirementLabel(reqId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label_id: string) =>
      api.post(`/requirements/${reqId}/labels`, { label_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requirements', reqId, 'labels'] });
    },
  });
}

export function useRemoveRequirementLabel(reqId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labelId: string) =>
      api.delete(`/requirements/${reqId}/labels/${labelId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requirements', reqId, 'labels'] });
    },
  });
}


