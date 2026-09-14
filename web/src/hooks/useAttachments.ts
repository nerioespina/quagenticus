import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Attachment, UploadedFile, UploadProgress } from '../lib/api';
import { qk } from '../lib/queryKeys';

export function useAttachments(docId: string, scope: '' | 'document' | 'comments' = '') {
  return useQuery({
    queryKey: [...qk.requirement(docId).attachments, scope],
    queryFn: () => api.get<Attachment[]>(`/documents/${docId}/attachments${scope ? `?scope=${scope}` : ''}`),
    enabled: !!docId,
  });
}

function invalidateAttachments(qc: ReturnType<typeof useQueryClient>, docId: string) {
  qc.invalidateQueries({ queryKey: qk.requirement(docId).attachments });
  qc.invalidateQueries({ queryKey: qk.requirement(docId).journals('history') });
  qc.invalidateQueries({ queryKey: qk.requirement(docId).detail });
}

/** Uploads straight to an existing document. */
export function useUploadToDocument(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ files, onProgress }: { files: File[]; onProgress?: (p: UploadProgress) => void }) =>
      api.upload<UploadedFile[]>(`/documents/${docId}/attachments`, files, onProgress),
    onSuccess: () => invalidateAttachments(qc, docId),
  });
}

/** Staged uploads for a comment or a requirement still being written. */
export function uploadStaged(spaceId: string, files: File[], documentId?: string, onProgress?: (p: UploadProgress) => void) {
  const qs = documentId ? `?document_id=${documentId}` : '';
  return api.upload<UploadedFile[]>(`/spaces/${spaceId}/uploads${qs}`, files, onProgress);
}

export function deleteStaged(id: string) {
  return api.delete(`/uploads/${id}`);
}

export function useDeleteAttachment(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachId: string) => api.delete(`/documents/${docId}/attachments/${attachId}`),
    onSuccess: () => invalidateAttachments(qc, docId),
  });
}

/** Signed URLs for a set of attachment ids (valid 15 min, cached 10). */
export function useSignedUrls(ids: string[]) {
  const key = [...ids].sort().join(',');
  return useQuery({
    queryKey: qk.signed(key),
    queryFn: () => api.post<Record<string, { url: string; filename: string; content_type: string }>>('/attachments/sign', { ids: key.split(',') }),
    enabled: ids.length > 0,
    staleTime: 10 * 60_000,
    gcTime: 12 * 60_000,
  });
}

export async function openAttachment(id: string, download = false) {
  const res = await api.get<{ url: string; download_url: string }>(`/attachments/${id}/url`);
  window.open(download ? res.download_url : res.url, '_blank', 'noopener');
}
