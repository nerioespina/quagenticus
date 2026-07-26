import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Board } from '../lib/api';

export function useBoards(spaceId: string) {
  return useQuery({
    queryKey: ['boards', spaceId],
    queryFn: () => api.get<{ id: string; name: string }[]>(`/spaces/${spaceId}/boards`),
    enabled: !!spaceId,
  });
}

export function useBoard(spaceId: string, boardId: string) {
  return useQuery({
    queryKey: ['board', spaceId, boardId],
    queryFn: () => api.get<Board>(`/spaces/${spaceId}/boards/${boardId}`),
    enabled: !!spaceId && !!boardId,
  });
}
