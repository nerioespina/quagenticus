import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Journal } from '../lib/api';
import { qk } from '../lib/queryKeys';

export function useJournals(docId: string, kind: 'comment' | 'history') {
  return useQuery({
    queryKey: qk.requirement(docId).journals(kind),
    queryFn: () => api.get<Journal[]>(`/documents/${docId}/journals?kind=${kind}`),
    enabled: !!docId,
  });
}

export function useCommentMutations(docId: string) {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: qk.requirement(docId).journalsAll });
    qc.invalidateQueries({ queryKey: qk.requirement(docId).attachments });
    qc.invalidateQueries({ queryKey: qk.requirement(docId).detail });
  };
  return {
    create: useMutation({
      mutationFn: (data: { notes_md: string; reply_to_id?: string | null; attachment_ids?: string[] }) =>
        api.post<{ id: string }>(`/documents/${docId}/journals`, data),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({ id, notes_md }: { id: string; notes_md: string }) => api.patch(`/journals/${id}`, { notes_md }),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/journals/${id}`), onSuccess: done }),
  };
}
