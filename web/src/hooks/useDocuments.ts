import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Document } from '../lib/api';

export function useDocuments(spaceId: string, docType?: string) {
  const params = docType ? `?type=${docType}` : '';
  return useQuery({
    queryKey: ['documents', spaceId, docType],
    queryFn: () => api.get<Document[]>(`/spaces/${spaceId}/documents${params}`),
    enabled: !!spaceId,
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: ['document', id],
    queryFn: () => api.get<Document>(`/documents/${id}`),
    enabled: !!id,
  });
}

export function useCreateDocument(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      doc_type: string;
      title: string;
      body_md?: string;
      parent_id?: string;
    }) => api.post<Document>(`/spaces/${spaceId}/documents`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents', spaceId] }),
  });
}

export function useUpdateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; title?: string; body_md?: string; version?: number }) =>
      api.patch<Document>(`/documents/${id}`, data),
    onSuccess: (doc) => {
      qc.setQueryData(['document', doc.id], doc);
      qc.invalidateQueries({ queryKey: ['documents', doc.space_id] });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });
}
