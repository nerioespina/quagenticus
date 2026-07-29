import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { DocumentLink, CreateDocumentLinkRequest } from '../lib/api';

export function useDocumentLinks(reqId: string) {
  return useQuery({
    queryKey: ['requirements', reqId, 'links'],
    queryFn: () => api.get<DocumentLink[]>(`/requirements/${reqId}/links`),
    enabled: !!reqId,
  });
}

export function useCreateDocumentLink(reqId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDocumentLinkRequest) =>
      api.post<DocumentLink>(`/requirements/${reqId}/links`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements', reqId, 'links'] });
    },
  });
}

export function useDeleteDocumentLink(reqId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      api.delete(`/requirements/${reqId}/links/${linkId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements', reqId, 'links'] });
    },
  });
}
