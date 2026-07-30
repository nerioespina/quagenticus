import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SystemUser } from '../lib/api';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<SystemUser[]>('/users'),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; password: string; display_name: string; is_account_admin?: boolean }) =>
      api.post<SystemUser>('/users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; display_name?: string; is_account_admin?: boolean; status?: string }) =>
      api.patch<SystemUser>(`/users/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ id, new_password }: { id: string; new_password: string }) =>
      api.patch<void>(`/users/${id}/password`, { new_password }),
  });
}

export function useChangeOwnPassword() {
  return useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) =>
      api.patch<void>('/auth/password', data),
  });
}
