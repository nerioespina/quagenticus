import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SpaceMember } from '../lib/api';

export function useSpaceMembers(spaceId: string) {
  return useQuery({
    queryKey: ['space-members', spaceId],
    queryFn: () => api.get<SpaceMember[]>(`/spaces/${spaceId}/members`),
    enabled: !!spaceId,
  });
}

export function useAddSpaceMember(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { user_id: string; role: string }) =>
      api.post<void>(`/spaces/${spaceId}/members`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['space-members', spaceId] });
    },
  });
}

export function useUpdateSpaceMember(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.patch<void>(`/spaces/${spaceId}/members/${userId}`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['space-members', spaceId] });
    },
  });
}

export function useRemoveSpaceMember(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/spaces/${spaceId}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['space-members', spaceId] });
    },
  });
}
