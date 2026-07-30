import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Priority, WorkflowStatus, Label, Milestone, Category } from '../lib/api';

export interface Tracker {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  color: string | null;
}

export function useTrackers() {
  return useQuery({
    queryKey: ['trackers'],
    queryFn: () => api.get<Tracker[]>('/catalogs/trackers'),
  });
}

export function usePriorities() {
  return useQuery({
    queryKey: ['priorities'],
    queryFn: () => api.get<Priority[]>('/catalogs/priorities'),
  });
}

export function useStatuses() {
  return useQuery({
    queryKey: ['statuses'],
    queryFn: () => api.get<WorkflowStatus[]>('/catalogs/statuses'),
  });
}

export function useLabels() {
  return useQuery({
    queryKey: ['labels'],
    queryFn: () => api.get<Label[]>('/catalogs/labels'),
  });
}

export function useSpaceLabels(spaceId: string) {
  return useQuery({
    queryKey: ['space-labels', spaceId],
    queryFn: () => api.get<Label[]>(`/spaces/${spaceId}/labels`),
    enabled: !!spaceId,
  });
}

export function useCreateSpaceLabel(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color: string }) =>
      api.post<Label>(`/spaces/${spaceId}/labels`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['space-labels', spaceId] });
      qc.invalidateQueries({ queryKey: ['labels'] });
    },
  });
}

export function useMilestones(spaceId: string) {
  return useQuery({
    queryKey: ['milestones', spaceId],
    queryFn: () => api.get<Milestone[]>(`/spaces/${spaceId}/milestones`),
    enabled: !!spaceId,
  });
}

export function useCreateMilestone(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; due_date?: string; status?: string }) =>
      api.post<Milestone>(`/spaces/${spaceId}/milestones`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['milestones', spaceId] });
    },
  });
}

export function useCategories(spaceId: string) {
  return useQuery({
    queryKey: ['categories', spaceId],
    queryFn: () => api.get<Category[]>(`/spaces/${spaceId}/categories`),
    enabled: !!spaceId,
  });
}

export function useCreateCategory(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      api.post<Category>(`/spaces/${spaceId}/categories`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories', spaceId] });
    },
  });
}
