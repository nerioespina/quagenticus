import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { DocType, Document, DocumentSummary, DocumentVersion } from '../lib/api';
import { qk } from '../lib/queryKeys';

export type DocumentFilters = { type?: string; parent_id?: string; archived?: string; favorites?: string; q?: string; all?: string };

export function useDocuments(spaceId: string, filters: DocumentFilters = {}) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => !!v) as [string, string][]).toString();
  return useQuery({
    queryKey: qk.space(spaceId).documents(filters),
    queryFn: () => api.get<DocumentSummary[]>(`/spaces/${spaceId}/documents${qs ? `?${qs}` : ''}`),
    enabled: !!spaceId,
    placeholderData: (prev) => prev,
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: qk.document(id).detail,
    queryFn: () => api.get<Document>(`/documents/${id}`),
    enabled: !!id,
  });
}

export function useCreateDocument(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { doc_type: Exclude<DocType, 'requirement'>; title: string; body_md?: string; parent_id?: string | null }) =>
      api.post<Document>(`/spaces/${spaceId}/documents`, data),
    onSuccess: (doc) => {
      qc.setQueryData(qk.document(doc.id).detail, doc);
      qc.invalidateQueries({ queryKey: [...qk.space(spaceId).all, 'documents'] });
    },
  });
}

export function useUpdateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; title?: string; body_md?: string; version?: number; doc_type?: DocType }) =>
      api.patch<Document>(`/documents/${id}`, data),
    onSuccess: (doc) => {
      qc.setQueryData(qk.document(doc.id).detail, doc);
      qc.invalidateQueries({ queryKey: [...qk.space(doc.space_id).all, 'documents'] });
      qc.invalidateQueries({ queryKey: qk.document(doc.id).history });
      qc.invalidateQueries({ queryKey: qk.requirement(doc.id).links });
    },
  });
}

export function useMoveDocument(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; parent_id: string | null; before_id?: string; after_id?: string }) =>
      api.patch<Document>(`/documents/${id}/move`, data),
    onSuccess: (doc) => {
      qc.setQueryData(qk.document(doc.id).detail, doc);
      qc.invalidateQueries({ queryKey: [...qk.space(spaceId).all, 'documents'] });
    },
  });
}

export function useDocumentHistory(id: string, enabled = true) {
  return useQuery({
    queryKey: qk.document(id).history,
    queryFn: () => api.get<DocumentVersion[]>(`/documents/${id}/history`),
    enabled: !!id && enabled,
  });
}

export function useDocumentVersion(id: string, version: number | null) {
  return useQuery({
    queryKey: qk.document(id).version(version ?? 0),
    queryFn: () => api.get<DocumentVersion>(`/documents/${id}/history/${version}`),
    enabled: !!id && !!version,
    staleTime: Infinity,
  });
}

export function useRestoreVersion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => api.post<Document>(`/documents/${id}/restore-version`, { version }),
    onSuccess: (doc) => {
      qc.setQueryData(qk.document(id).detail, doc);
      qc.invalidateQueries({ queryKey: qk.document(id).history });
      qc.invalidateQueries({ queryKey: qk.requirement(id).detail });
    },
  });
}

export function useFavorite(id: string, spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fav: boolean) => (fav ? api.put(`/documents/${id}/favorite`) : api.delete(`/documents/${id}/favorite`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.document(id).detail });
      qc.invalidateQueries({ queryKey: [...qk.space(spaceId).all, 'documents'] });
    },
  });
}

export function usePromoteDocument(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; tracker_id: string; priority_id?: string }) =>
      api.post<{ id: string; ref_key: string }>(`/documents/${id}/promote`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.space(spaceId).all }),
  });
}
