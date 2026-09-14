import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Role, Space, SpaceMember } from '../lib/api';
import { qk } from '../lib/queryKeys';

export function useSpaces(archived = false) {
  return useQuery({
    queryKey: [...qk.spaces, archived],
    queryFn: () => api.get<Space[]>(`/spaces${archived ? '?archived=true' : ''}`),
  });
}

export function useSpace(id: string) {
  return useQuery({
    queryKey: qk.space(id).detail,
    queryFn: () => api.get<Space>(`/spaces/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { key: string; name: string; description_md?: string }) => api.post<Space>('/spaces', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.spaces }),
  });
}

export function useUpdateSpace(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Pick<Space, 'name' | 'description_md' | 'icon' | 'color' | 'is_archived'>> & { settings?: Record<string, unknown> }) =>
      api.patch<Space>(`/spaces/${spaceId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.space(spaceId).detail });
      qc.invalidateQueries({ queryKey: qk.spaces });
    },
  });
}

/** Single source for space members (used by pickers and the members admin). */
export function useSpaceMembers(spaceId: string) {
  return useQuery({
    queryKey: qk.space(spaceId).members,
    queryFn: () => api.get<SpaceMember[]>(`/spaces/${spaceId}/members`),
    enabled: !!spaceId,
    staleTime: 60_000,
  });
}

export function useAddSpaceMember(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { user_id: string; role: Role }) => api.post<void>(`/spaces/${spaceId}/members`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.space(spaceId).members }),
  });
}

export function useUpdateSpaceMember(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) => api.patch<void>(`/spaces/${spaceId}/members/${userId}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.space(spaceId).members }),
  });
}

export function useRemoveSpaceMember(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.delete(`/spaces/${spaceId}/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.space(spaceId).members }),
  });
}
