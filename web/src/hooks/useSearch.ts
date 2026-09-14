import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { MyWork, ResolvedRefs, SearchResult, SuggestItem } from '../lib/api';
import { qk } from '../lib/queryKeys';

export function useSuggest(spaceId: string, q: string, types: string[], enabled = true) {
  const t = types.join(',');
  return useQuery({
    queryKey: qk.space(spaceId).suggest(q, t),
    queryFn: () => api.get<SuggestItem[]>(`/spaces/${spaceId}/suggest?q=${encodeURIComponent(q)}&types=${t}&limit=8`),
    enabled: enabled && !!spaceId,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useResolvedRefs(spaceId: string, refs: { requirements: string[]; wikilinks: string[]; users: string[] }) {
  const keys = [...refs.requirements].sort().join(',');
  const titles = [...refs.wikilinks].sort().join('|');
  const handles = [...refs.users].sort().join(',');
  const cacheKey = `${keys}#${titles}#${handles}`;
  return useQuery({
    queryKey: qk.space(spaceId).refs(cacheKey),
    queryFn: () =>
      api.get<ResolvedRefs>(
        `/spaces/${spaceId}/refs/resolve?keys=${encodeURIComponent(keys)}&titles=${encodeURIComponent(titles)}&handles=${encodeURIComponent(handles)}`,
      ),
    enabled: !!spaceId && cacheKey !== '##',
    staleTime: 60_000,
  });
}

export function useSearch(q: string, spaceId?: string) {
  return useQuery({
    queryKey: qk.search(q, spaceId),
    queryFn: () => api.get<SearchResult[]>(`/search?q=${encodeURIComponent(q)}${spaceId ? `&space_id=${spaceId}` : ''}&limit=30`),
    enabled: q.trim().length >= 2,
    placeholderData: (prev) => prev,
  });
}

export function useMyWork() {
  return useQuery({ queryKey: qk.myWork, queryFn: () => api.get<MyWork>('/me/work') });
}
