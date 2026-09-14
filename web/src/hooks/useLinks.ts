import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { DocumentLink } from '../lib/api';
import { qk } from '../lib/queryKeys';

export function useLinks(docId: string) {
  return useQuery({
    queryKey: qk.requirement(docId).links,
    queryFn: () => api.get<DocumentLink[]>(`/documents/${docId}/links`),
    enabled: !!docId,
  });
}

export function useBacklinks(docId: string) {
  return useQuery({
    queryKey: qk.requirement(docId).backlinks,
    queryFn: () => api.get<DocumentLink[]>(`/documents/${docId}/backlinks`),
    enabled: !!docId,
  });
}

export function useLinkMutations(docId: string) {
  const qc = useQueryClient();
  const done = (targetId?: string | null) => {
    qc.invalidateQueries({ queryKey: qk.requirement(docId).links });
    qc.invalidateQueries({ queryKey: qk.requirement(docId).journals('history') });
    if (targetId) qc.invalidateQueries({ queryKey: qk.requirement(targetId).links });
  };
  return {
    create: useMutation({
      mutationFn: (data: { target_id: string; link_type: string; note?: string }) => api.post<DocumentLink>(`/documents/${docId}/links`, data),
      onSuccess: (link) => done(link.target_id),
    }),
    remove: useMutation({ mutationFn: (linkId: string) => api.delete(`/documents/${docId}/links/${linkId}`), onSuccess: () => done() }),
  };
}
