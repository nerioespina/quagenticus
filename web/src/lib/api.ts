const BASE_URL = (import.meta.env.VITE_API_URL ?? '') + '/api/v1';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('qg_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers as Record<string, string> ?? {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({ message: res.statusText }));
  if (!res.ok) {
    throw new ApiError(res.status, body.code ?? 'error', body.message ?? res.statusText);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
  upload: async <T>(path: string, file: File): Promise<T> => {
    const token = localStorage.getItem('qg_token');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form,
    });
    if (res.status === 204) return undefined as T;
    const body = await res.json().catch(() => ({ message: res.statusText }));
    if (!res.ok) {
      throw new ApiError(res.status, body.code ?? 'error', body.message ?? res.statusText);
    }
    return body as T;
  },
};


// --- Types ---

export interface User {
  id: string;
  account_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  locale: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface Space {
  id: string;
  account_id: string;
  key: string;
  name: string;
  description_md: string;
  icon: string | null;
  color: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  space_id: string;
  parent_id: string | null;
  doc_type: 'folder' | 'note' | 'wiki' | 'requirement' | 'template';
  ref_key: string | null;
  slug: string;
  title: string;
  body_md: string;
  version: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Requirement {
  id: string;
  space_id: string;
  account_id: string;
  ref_key: string;
  title: string;
  body_md: string;
  tracker_id: string;
  status_id: string;
  status_key: string;
  status_name: string;
  priority_id: string;
  priority_key: string;
  priority_name: string;
  category_id: string | null;
  milestone_id: string | null;
  reporter_id: string;
  lead_user_id: string | null;
  claimed_by_agent_id: string | null;
  board_position: number;
  readiness_score: number | null;
  done_ratio: number;
  estimated_hours: number | null;
  spent_hours: number;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoardColumn {
  id: string;
  name: string;
  status_id: string | null;
  ord: number;
  wip_limit: number | null;
  color: string | null;
  cards: BoardCard[];
}

export interface BoardCard {
  id: string;
  ref_key: string | null;
  title: string;
  priority_id: string;
  priority_key: string;
  priority_name: string;
  lead_user_id: string | null;
  board_position: number;
  updated_at: string;
}

export interface Board {
  id: string;
  space_id: string | null;
  name: string;
  columns: BoardColumn[];
}

export interface Tracker {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  color: string | null;
}

export interface Priority {
  id: string;
  key: string;
  name: string;
  weight: number;
  color: string | null;
  is_default: boolean;
}

export interface WorkflowStatus {
  id: string;
  key: string;
  name: string;
  color: string | null;
  ord: number;
  is_default: boolean;
  is_closed: boolean;
}

export interface Journal {
  id: string;
  requirement_id: string;
  actor_type: string;
  actor_id: string | null;
  notes_md: string;
  details: Array<{
    type: string;
    from?: unknown;
    to?: unknown;
    property?: string;
  }>;
  created_at: string;
}

export interface Attachment {
  id: string;
  requirement_id: string;
  filename: string;
  content_type: string;
  byte_size: number;
  created_at: string;
}

export interface Milestone {
  id: string;
  space_id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  status: string;
}

export interface Category {
  id: string;
  space_id: string;
  name: string;
  description: string | null;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface RequirementMember {
  subject_type: string;
  subject_id: string;
  is_lead: boolean;
  added_at: string;
  display_name: string;
  email: string;
}

export interface DocumentLink {
  id: string;
  source_id: string;
  target_id: string;
  target_title: string;
  target_slug: string;
  target_type: string;
  link_type: string;
  note: string;
  created_at: string;
}

export interface CreateDocumentLinkRequest {
  target_id: string;
  link_type: string;
  note?: string;
}


