import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Board, BoardCard, BoardSummary } from '../lib/api';
import { qk } from '../lib/queryKeys';

export function useBoards(spaceId: string) {
  return useQuery({
    queryKey: qk.space(spaceId).boards,
    queryFn: () => api.get<BoardSummary[]>(`/spaces/${spaceId}/boards`),
    enabled: !!spaceId,
  });
}

export function useBoard(spaceId: string, boardId: string, closedDays = 14) {
  return useQuery({
    queryKey: [...qk.space(spaceId).board(boardId), closedDays],
    queryFn: () => api.get<Board>(`/spaces/${spaceId}/boards/${boardId}?closed_days=${closedDays}`),
    enabled: !!spaceId && !!boardId,
  });
}

export function useCreateBoard(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) => api.post<BoardSummary>(`/spaces/${spaceId}/boards`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.space(spaceId).boards }),
  });
}

export function useUpdateBoardColumn(spaceId: string, boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ statusId, ...data }: { statusId: string; name?: string; color?: string | null; wip_limit?: number | null; is_collapsed?: boolean; is_hidden?: boolean }) =>
      api.patch(`/boards/${boardId}/columns/${statusId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.space(spaceId).board(boardId) }),
  });
}

/** Replaces a card inside every cached board of the space (used after quick edits). */
export function patchCardInBoards(qc: ReturnType<typeof useQueryClient>, spaceId: string, card: Partial<BoardCard> & { id: string }) {
  qc.setQueriesData<Board>({ queryKey: [...qk.space(spaceId).all, 'board'] }, (board) => {
    if (!board) return board;
    return {
      ...board,
      columns: board.columns.map((col) => ({
        ...col,
        cards: col.cards.map((c) => (c.id === card.id ? { ...c, ...card } : c)),
      })),
    };
  });
}
