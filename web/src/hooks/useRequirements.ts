import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  BoardCard, Requirement, RequirementMember, RequirementPage, RequirementSummary, TimeEntry,
} from '../lib/api';
import { qk } from '../lib/queryKeys';

export type RequirementFilters = Record<string, string>;

export function useRequirementPage(spaceId: string, filters: RequirementFilters) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined)).toString();
  return useQuery({
    queryKey: qk.space(spaceId).requirements(filters),
    queryFn: () => api.get<RequirementPage>(`/spaces/${spaceId}/requirements${qs ? `?${qs}` : ''}`),
    enabled: !!spaceId,
    placeholderData: (prev) => prev,
  });
}

export function useRequirement(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.requirement(id ?? '').detail,
    queryFn: () => api.get<Requirement>(`/requirements/${id}`),
    enabled: !!id,
  });
}

/** After any change to a requirement: refresh lists/boards of its space and its history. */
export function useRequirementRefresh() {
  const qc = useQueryClient();
  return (req: { id: string; space_id: string }) => {
    qc.invalidateQueries({ queryKey: [...qk.space(req.space_id).all, 'requirements'] });
    qc.invalidateQueries({ queryKey: [...qk.space(req.space_id).all, 'board'] });
    qc.invalidateQueries({ queryKey: qk.requirement(req.id).journals('history') });
    qc.invalidateQueries({ queryKey: qk.myWork });
  };
}

export type CreateRequirementInput = {
  tracker_id: string;
  title: string;
  body_md?: string;
  priority_id?: string;
  status_id?: string | null;
  category_id?: string | null;
  milestone_id?: string | null;
  parent_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  estimated_hours?: number | null;
  lead_user_id?: string | null;
  member_ids?: string[];
  label_ids?: string[];
  attachment_ids?: string[];
  links?: { target_id: string; link_type: string }[];
};

export function useCreateRequirement(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRequirementInput) => api.post<Requirement>(`/spaces/${spaceId}/requirements`, data),
    onSuccess: (req) => {
      qc.setQueryData(qk.requirement(req.id).detail, req);
      qc.invalidateQueries({ queryKey: [...qk.space(spaceId).all, 'requirements'] });
      qc.invalidateQueries({ queryKey: [...qk.space(spaceId).all, 'board'] });
      if (req.parent_id) qc.invalidateQueries({ queryKey: qk.requirement(req.parent_id).children });
    },
  });
}

export type RequirementPatch = Partial<{
  title: string;
  body_md: string;
  tracker_id: string;
  priority_id: string;
  category_id: string | null;
  milestone_id: string | null;
  parent_id: string | null;
  done_ratio: number;
  estimated_hours: number | null;
  spent_hours: number | null;
  start_date: string | null;
  due_date: string | null;
  version: number;
}>;

export function useUpdateRequirement() {
  const qc = useQueryClient();
  const refresh = useRequirementRefresh();
  return useMutation({
    mutationFn: ({ id, ...data }: RequirementPatch & { id: string }) => api.patch<Requirement>(`/requirements/${id}`, data),
    onSuccess: (req) => {
      qc.setQueryData(qk.requirement(req.id).detail, req);
      refresh(req);
    },
  });
}

export function useTransitionRequirement() {
  const qc = useQueryClient();
  const refresh = useRequirementRefresh();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; to_status_id: string; comment?: string; resolution?: string }) =>
      api.post<Requirement>(`/requirements/${id}/transition`, data),
    onSuccess: (req) => {
      qc.setQueryData(qk.requirement(req.id).detail, req);
      qc.invalidateQueries({ queryKey: qk.requirement(req.id).transitions });
      refresh(req);
    },
  });
}

export function useAllowedTransitions(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.requirement(id ?? '').transitions,
    queryFn: () => api.get<string[]>(`/requirements/${id}/transitions`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useMoveCard() {
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; to_status_id?: string; before_id?: string; after_id?: string; comment?: string; resolution?: string }) =>
      api.patch<BoardCard>(`/requirements/${id}/move`, data),
  });
}

export function useRequirementMembers(id: string) {
  return useQuery({
    queryKey: qk.requirement(id).members,
    queryFn: () => api.get<RequirementMember[]>(`/requirements/${id}/members`),
    enabled: !!id,
  });
}

function useMembersMutationOptions(id: string, spaceId: string) {
  const qc = useQueryClient();
  const refresh = useRequirementRefresh();
  return {
    onSuccess: (members: RequirementMember[] | void) => {
      if (members) qc.setQueryData(qk.requirement(id).members, members);
      else qc.invalidateQueries({ queryKey: qk.requirement(id).members });
      qc.invalidateQueries({ queryKey: qk.requirement(id).detail });
      refresh({ id, space_id: spaceId });
    },
  };
}

export function useSetRequirementMembers(id: string, spaceId: string) {
  return useMutation({
    mutationFn: (data: { user_ids: string[]; lead_user_id: string | null }) => api.put<RequirementMember[]>(`/requirements/${id}/members`, data),
    ...useMembersMutationOptions(id, spaceId),
  });
}

export function useAddRequirementMember(id: string, spaceId: string) {
  return useMutation({
    mutationFn: (data: { subject_id: string; is_lead?: boolean }) => api.post<RequirementMember[]>(`/requirements/${id}/members`, data),
    ...useMembersMutationOptions(id, spaceId),
  });
}

export function useRemoveRequirementMember(id: string, spaceId: string) {
  return useMutation({
    mutationFn: (userId: string) => api.delete(`/requirements/${id}/members/${userId}`),
    ...useMembersMutationOptions(id, spaceId),
  });
}

export function useSetRequirementLead(id: string, spaceId: string) {
  const opts = useMembersMutationOptions(id, spaceId);
  return useMutation({
    mutationFn: (lead_user_id: string | null) => api.patch<Requirement>(`/requirements/${id}/lead`, { lead_user_id }),
    onSuccess: () => opts.onSuccess(undefined),
  });
}

export function useDocumentLabelsMutation(docId: string, spaceId: string) {
  const qc = useQueryClient();
  const refresh = useRequirementRefresh();
  const done = () => {
    qc.invalidateQueries({ queryKey: qk.requirement(docId).detail });
    qc.invalidateQueries({ queryKey: qk.document(docId).detail });
    qc.invalidateQueries({ queryKey: [...qk.space(spaceId).all, 'documents'] });
    refresh({ id: docId, space_id: spaceId });
  };
  const add = useMutation({ mutationFn: (labelId: string) => api.post(`/documents/${docId}/labels`, { label_id: labelId }), onSuccess: done });
  const remove = useMutation({ mutationFn: (labelId: string) => api.delete(`/documents/${docId}/labels/${labelId}`), onSuccess: done });
  return { add, remove };
}

export function useRequirementChildren(id: string) {
  return useQuery({
    queryKey: qk.requirement(id).children,
    queryFn: () => api.get<RequirementSummary[]>(`/requirements/${id}/children`),
    enabled: !!id,
  });
}

export function useCloneRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title?: string }) => api.post<Requirement>(`/requirements/${id}/clone`, { title }),
    onSuccess: (req) => {
      qc.invalidateQueries({ queryKey: [...qk.space(req.space_id).all] });
    },
  });
}

export function useArchiveDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean; spaceId: string }) =>
      api.post(`/documents/${id}/${archived ? 'archive' : 'restore'}`),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: qk.space(v.spaceId).all });
      qc.invalidateQueries({ queryKey: qk.requirement(v.id).all });
      qc.invalidateQueries({ queryKey: qk.document(v.id).all });
    },
  });
}

export function useMoveRequirementToSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, space_id }: { id: string; space_id: string }) =>
      api.post<{ ref_key: string; space_id: string }>(`/requirements/${id}/move-space`, { space_id }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useBulkUpdate(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { ids: string[]; patch?: Record<string, unknown>; to_status_id?: string; add_label_id?: string; add_member_id?: string }) =>
      api.post<void>(`/spaces/${spaceId}/requirements/bulk`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.space(spaceId).all });
      qc.invalidateQueries({ queryKey: ['requirement'] });
    },
  });
}

export function useTimeEntries(id: string) {
  return useQuery({
    queryKey: qk.requirement(id).timeEntries,
    queryFn: () => api.get<TimeEntry[]>(`/requirements/${id}/time-entries`),
    enabled: !!id,
  });
}

export function useTimeEntryMutations(id: string, spaceId: string) {
  const qc = useQueryClient();
  const refresh = useRequirementRefresh();
  const done = () => {
    qc.invalidateQueries({ queryKey: qk.requirement(id).timeEntries });
    qc.invalidateQueries({ queryKey: qk.requirement(id).detail });
    refresh({ id, space_id: spaceId });
  };
  return {
    add: useMutation({
      mutationFn: (data: { hours: number; spent_on?: string; note?: string }) => api.post(`/requirements/${id}/time-entries`, data),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (entryId: string) => api.delete(`/time-entries/${entryId}`), onSuccess: done }),
  };
}

export function useWatch(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (watch: boolean) => (watch ? api.put(`/documents/${docId}/watch`) : api.delete(`/documents/${docId}/watch`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.requirement(docId).detail });
      qc.invalidateQueries({ queryKey: qk.document(docId).detail });
    },
  });
}
