// Hierarchical query keys. Invalidating a prefix only touches what it owns:
// qk.space(id).requirements() never refetches another requirement's members.
export const qk = {
  me: ['me'] as const,
  health: ['health'] as const,
  spaces: ['spaces'] as const,
  catalogs: {
    trackers: ['catalogs', 'trackers'] as const,
    priorities: ['catalogs', 'priorities'] as const,
    statuses: ['catalogs', 'statuses'] as const,
    labels: ['catalogs', 'labels'] as const,
  },
  users: ['users'] as const,
  admin: {
    transitions: (trackerId: string) => ['admin', 'transitions', trackerId] as const,
    agents: ['admin', 'agents'] as const,
  },
  space: (spaceId: string) => {
    const base = ['space', spaceId] as const;
    return {
      all: base,
      detail: [...base, 'detail'] as const,
      members: [...base, 'members'] as const,
      labels: [...base, 'labels'] as const,
      milestones: [...base, 'milestones'] as const,
      categories: [...base, 'categories'] as const,
      boards: [...base, 'boards'] as const,
      board: (boardId: string) => [...base, 'board', boardId] as const,
      requirements: (filters?: Record<string, unknown>) =>
        (filters ? [...base, 'requirements', filters] : [...base, 'requirements']) as readonly unknown[],
      documents: (filters?: Record<string, unknown>) =>
        (filters ? [...base, 'documents', filters] : [...base, 'documents']) as readonly unknown[],
      views: [...base, 'views'] as const,
      agentQueue: [...base, 'agent-queue'] as const,
      suggest: (q: string, types: string) => [...base, 'suggest', types, q] as const,
      refs: (keys: string) => [...base, 'refs', keys] as const,
    };
  },
  requirement: (id: string) => {
    const base = ['requirement', id] as const;
    return {
      all: base,
      detail: [...base, 'detail'] as const,
      members: [...base, 'members'] as const,
      journals: (kind: string) => [...base, 'journals', kind] as const,
      journalsAll: [...base, 'journals'] as const,
      attachments: [...base, 'attachments'] as const,
      links: [...base, 'links'] as const,
      backlinks: [...base, 'backlinks'] as const,
      children: [...base, 'children'] as const,
      transitions: [...base, 'transitions'] as const,
      timeEntries: [...base, 'time-entries'] as const,
    };
  },
  document: (id: string) => {
    const base = ['document', id] as const;
    return {
      all: base,
      detail: [...base, 'detail'] as const,
      history: [...base, 'history'] as const,
      version: (v: number) => [...base, 'version', v] as const,
      links: [...base, 'links'] as const,
      backlinks: [...base, 'backlinks'] as const,
      attachments: [...base, 'attachments'] as const,
    };
  },
  notifications: {
    all: ['notifications'] as const,
    list: ['notifications', 'list'] as const,
    count: ['notifications', 'count'] as const,
  },
  search: (q: string, spaceId?: string) => ['search', q, spaceId ?? ''] as const,
  myWork: ['my-work'] as const,
  signed: (ids: string) => ['signed-attachments', ids] as const,
};
