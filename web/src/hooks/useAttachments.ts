import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Attachment } from '../lib/api';

export function useAttachments(reqId: string) {
  return useQuery({
    queryKey: ['requirements', reqId, 'attachments'],
    queryFn: () => api.get<Attachment[]>(`/requirements/${reqId}/attachments`),
    enabled: !!reqId,
  });
}

export function useUploadAttachment(reqId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      api.upload<Attachment>(`/requirements/${reqId}/attachments`, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements', reqId, 'attachments'] });
    },
  });
}

export function useDeleteAttachment(reqId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachId: string) =>
      api.delete(`/requirements/${reqId}/attachments/${attachId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements', reqId, 'attachments'] });
    },
  });
}
