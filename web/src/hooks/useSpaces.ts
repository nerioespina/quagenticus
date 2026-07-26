import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Space } from '../lib/api';

export function useSpaces() {
  return useQuery({
    queryKey: ['spaces'],
    queryFn: () => api.get<Space[]>('/spaces'),
  });
}

export function useSpace(id: string) {
  return useQuery({
    queryKey: ['spaces', id],
    queryFn: () => api.get<Space>(`/spaces/${id}`),
    enabled: !!id,
  });
}

export function useCreateSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { key: string; name: string; description_md?: string }) =>
      api.post<Space>('/spaces', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spaces'] }),
  });
}
