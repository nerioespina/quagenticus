import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { RequirementMember } from '../lib/api';

export interface SpaceMember {
  id: string;
  display_name: string;
  email: string;
  role: string;
}

export function useSpaceMembers(spaceId: string) {
  return useQuery({
    queryKey: ['spaces', spaceId, 'members'],
    queryFn: () => api.get<SpaceMember[]>(`/spaces/${spaceId}/members`),
    enabled: !!spaceId,
  });
}

export function useRequirementMembers(reqId: string) {
  return useQuery({
    queryKey: ['requirements', reqId, 'members'],
    queryFn: () => api.get<RequirementMember[]>(`/requirements/${reqId}/members`),
    enabled: !!reqId,
  });
}

export function useAddRequirementMember(reqId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { subject_type: string; subject_id: string; is_lead: boolean }) =>
      api.post(`/requirements/${reqId}/members`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements', reqId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['requirements', reqId] });
    },
  });
}

export function useRemoveRequirementMember(reqId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subjectId: string) =>
      api.delete(`/requirements/${reqId}/members/${subjectId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements', reqId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['requirements', reqId] });
    },
  });
}

export function useSetRequirementLead(reqId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { lead_user_id: string | null }) =>
      api.patch(`/requirements/${reqId}/lead`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements', reqId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['requirements', reqId] });
    },
  });
}
