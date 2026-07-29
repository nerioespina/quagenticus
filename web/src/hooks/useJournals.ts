import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Journal } from '../lib/api';

export interface ExtendedJournal extends Journal {
  actor_name?: string;
}

export function useRequirementJournals(reqId: string) {
  return useQuery({
    queryKey: ['requirements', reqId, 'journals'],
    queryFn: () => api.get<ExtendedJournal[]>(`/requirements/${reqId}/journals`),
    enabled: !!reqId,
  });
}

export function useCreateRequirementJournal(reqId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { notes_md: string }) =>
      api.post(`/requirements/${reqId}/journals`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements', reqId, 'journals'] });
    },
  });
}
