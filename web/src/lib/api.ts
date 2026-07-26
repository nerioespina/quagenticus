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
  priority_id: string;
  category_id: string | null;
  milestone_id: string | null;
  reporter_id: string;
  lead_user_id: string | null;
  claimed_by_agent_id: string | null;
  board_position: number;
  readiness_score: number | null;
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
