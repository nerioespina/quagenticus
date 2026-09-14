import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Category, Label, Milestone, Priority, Tracker, WorkflowStatus } from '../lib/api';
import { qk } from '../lib/queryKeys';

const CATALOG_STALE = 5 * 60_000;

export function useTrackers(all = false) {
  return useQuery({
    queryKey: [...qk.catalogs.trackers, all],
    queryFn: () => api.get<Tracker[]>(`/catalogs/trackers${all ? '?all=true' : ''}`),
    staleTime: CATALOG_STALE,
  });
}

export function usePriorities() {
  return useQuery({ queryKey: qk.catalogs.priorities, queryFn: () => api.get<Priority[]>('/catalogs/priorities'), staleTime: CATALOG_STALE });
}

export function useStatuses() {
  return useQuery({ queryKey: qk.catalogs.statuses, queryFn: () => api.get<WorkflowStatus[]>('/catalogs/statuses'), staleTime: CATALOG_STALE });
}

export function useSpaceLabels(spaceId: string) {
  return useQuery({
    queryKey: qk.space(spaceId).labels,
    queryFn: () => api.get<Label[]>(`/spaces/${spaceId}/labels`),
    enabled: !!spaceId,
    staleTime: 60_000,
  });
}

export function useCreateSpaceLabel(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color: string; description?: string }) => api.post<Label>(`/spaces/${spaceId}/labels`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.space(spaceId).labels }),
  });
}

export function useUpdateLabel(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; color?: string; description?: string }) => api.patch<Label>(`/labels/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.space(spaceId).labels }),
  });
}

export function useDeleteLabel(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/labels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.space(spaceId).labels }),
  });
}

export function useMilestones(spaceId: string) {
  return useQuery({
    queryKey: qk.space(spaceId).milestones,
    queryFn: () => api.get<Milestone[]>(`/spaces/${spaceId}/milestones`),
    enabled: !!spaceId,
  });
}

export function useSaveMilestone(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id?: string; name?: string; description?: string | null; due_date?: string | null; status?: string }) =>
      id ? api.patch<Milestone>(`/milestones/${id}`, data) : api.post<Milestone>(`/spaces/${spaceId}/milestones`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.space(spaceId).milestones }),
  });
}

export function useDeleteMilestone(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/milestones/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.space(spaceId).milestones }),
  });
}

export function useCategories(spaceId: string) {
  return useQuery({
    queryKey: qk.space(spaceId).categories,
    queryFn: () => api.get<Category[]>(`/spaces/${spaceId}/categories`),
    enabled: !!spaceId,
  });
}

export function useSaveCategory(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id?: string; name?: string; description?: string | null; default_user_id?: string | null }) =>
      id ? api.patch<Category>(`/categories/${id}`, data) : api.post<Category>(`/spaces/${spaceId}/categories`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.space(spaceId).categories }),
  });
}

export function useDeleteCategory(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.space(spaceId).categories }),
  });
}

/** Convenience lookups by id. */
export function useCatalogMaps() {
  const { data: statuses = [] } = useStatuses();
  const { data: priorities = [] } = usePriorities();
  const { data: trackers = [] } = useTrackers(true);
  return {
    statuses,
    priorities,
    trackers,
    statusById: Object.fromEntries(statuses.map((s) => [s.id, s])) as Record<string, WorkflowStatus>,
    priorityById: Object.fromEntries(priorities.map((p) => [p.id, p])) as Record<string, Priority>,
    trackerById: Object.fromEntries(trackers.map((t) => [t.id, t])) as Record<string, Tracker>,
  };
}
