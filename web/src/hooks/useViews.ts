import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SavedView } from '../lib/api';
import { qk } from '../lib/queryKeys';

export function useSavedViews(spaceId: string) {
  return useQuery({ queryKey: qk.space(spaceId).views, queryFn: () => api.get<SavedView[]>(`/spaces/${spaceId}/views`), enabled: !!spaceId });
}

export function useSavedViewMutations(spaceId: string) {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: qk.space(spaceId).views });
  return {
    create: useMutation({
      mutationFn: (data: { name: string; filters: Record<string, string>; shared: boolean }) => api.post<SavedView>(`/spaces/${spaceId}/views`, data),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/views/${id}`), onSuccess: done }),
  };
}
