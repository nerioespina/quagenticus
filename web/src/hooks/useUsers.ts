import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Me, SystemUser } from '../lib/api';
import { qk } from '../lib/queryKeys';

export function useUsers() {
  return useQuery({ queryKey: qk.users, queryFn: () => api.get<SystemUser[]>('/users') });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; password: string; display_name: string; handle?: string; is_account_admin?: boolean }) =>
      api.post<SystemUser>('/users', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; display_name?: string; handle?: string; is_account_admin?: boolean; status?: string }) =>
      api.patch<SystemUser>(`/users/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ id, new_password }: { id: string; new_password: string }) => api.patch<void>(`/users/${id}/password`, { new_password }),
  });
}

export function useChangeOwnPassword() {
  return useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) => api.patch<void>('/auth/password', data),
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Pick<Me, 'display_name' | 'handle' | 'avatar_url' | 'locale' | 'timezone' | 'preferences'>>) =>
      api.patch<Me>('/auth/me', data),
    onSuccess: (me) => qc.setQueryData(qk.me, me),
  });
}
