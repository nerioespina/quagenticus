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

// ---------------------------------------------------------------- session

type TokenListener = (token: string | null) => void;

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
const listeners = new Set<TokenListener>();

export const session = {
  get token() {
    return accessToken;
  },
  set(token: string | null) {
    accessToken = token;
    listeners.forEach((l) => l(token));
  },
  subscribe(l: TokenListener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Exchanges the httpOnly refresh cookie for a new access token (single flight). */
  refresh(): Promise<string | null> {
    if (!refreshPromise) {
      refreshPromise = fetch(`${BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
        .then(async (res) => {
          if (!res.ok) return null;
          const body = (await res.json()) as LoginResponse;
          return body.access_token;
        })
        .catch(() => null)
        .then((token) => {
          session.set(token);
          return token;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  },
};

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('Content-Type') ?? '';
  if (!type.includes('application/json')) {
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, 'error', text || res.statusText);
    return text as T;
  }
  const body = await res.json().catch(() => ({ message: res.statusText }));
  if (!res.ok) {
    throw new ApiError(res.status, body.code ?? 'error', body.message ?? res.statusText);
  }
  return body as T;
}

async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers, credentials: 'include' });
  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    const token = await session.refresh();
    if (token) return request<T>(path, init, true);
  }
  return parse<T>(res);
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

function uploadXHR<T>(path: string, files: File[], onProgress?: (p: UploadProgress) => void, retried = false): Promise<T> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    files.forEach((f) => form.append('file', f, f.name));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}${path}`);
    xhr.withCredentials = true;
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.({ loaded: e.loaded, total: e.total });
    };
    xhr.onerror = () => reject(new ApiError(0, 'network', 'Error de red al subir el archivo'));
    xhr.onload = async () => {
      if (xhr.status === 401 && !retried) {
        const token = await session.refresh();
        if (token) {
          uploadXHR<T>(path, files, onProgress, true).then(resolve, reject);
          return;
        }
      }
      let body: { code?: string; message?: string } | T = {} as T;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* empty */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else {
        const b = body as { code?: string; message?: string };
        reject(new ApiError(xhr.status, b.code ?? 'error', b.message ?? xhr.statusText));
      }
    };
    xhr.send(form);
  });
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: data === undefined ? undefined : JSON.stringify(data) }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
  upload: <T>(path: string, files: File[], onProgress?: (p: UploadProgress) => void) => uploadXHR<T>(path, files, onProgress),
  eventsUrl: () => `${BASE_URL}/events?access_token=${encodeURIComponent(accessToken ?? '')}`,
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Ocurrió un error inesperado';
}

// ------------------------------------------------------------------ types

export type Role = 'viewer' | 'contributor' | 'maintainer' | 'admin';
export type DateOnly = string; // YYYY-MM-DD

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface Me {
  id: string;
  account_id: string;
  email: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  locale: string;
  timezone: string;
  is_account_admin: boolean;
  preferences: { notifications?: { email?: boolean }; theme?: string; [k: string]: unknown };
  actor_type: 'user' | 'agent';
}
export type User = Me;

export interface Space {
  id: string;
  account_id: string;
  key: string;
  name: string;
  description_md: string;
  icon: string | null;
  color: string | null;
  modules: Record<string, boolean>;
  settings: { viewers_can_comment?: boolean; [k: string]: unknown };
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  my_role: Role;
  member_count?: number;
  open_requirements?: number;
}

export interface LabelRef {
  id: string;
  name: string;
  color: string;
}
export type Label = LabelRef & { space_id?: string | null; slug?: string; description?: string | null; usage_count?: number };

export interface CardMember {
  id: string;
  type: 'user' | 'agent';
  is_lead: boolean;
  display_name: string;
  avatar_url: string | null;
}

export interface RequirementSummary {
  id: string;
  space_id: string;
  ref_key: string;
  title: string;
  version: number;
  tracker_id: string;
  tracker_key: string;
  tracker_name: string;
  tracker_icon: string | null;
  status_id: string;
  status_key: string;
  status_name: string;
  status_color: string | null;
  status_is_closed: boolean;
  priority_id: string;
  priority_key: string;
  priority_name: string;
  priority_color: string | null;
  priority_weight: number;
  category_id: string | null;
  milestone_id: string | null;
  parent_id: string | null;
  reporter_id: string;
  reporter_name: string | null;
  lead_user_id: string | null;
  board_position: number;
  readiness_score: number | null;
  done_ratio: number;
  estimated_hours: number | null;
  spent_hours: number;
  start_date: DateOnly | null;
  due_date: DateOnly | null;
  resolution: string | null;
  closed_at: string | null;
  claimed_by_agent_id: string | null;
  claimed_by_agent_name: string | null;
  member_count: number;
  created_at: string;
  updated_at: string;
  labels: LabelRef[];
  members: CardMember[];
}

export interface ReadinessCriterion {
  key: string;
  label: string;
  passed: boolean;
}

export interface Requirement extends RequirementSummary {
  body_md: string;
  readiness_report: { score?: number; ready?: boolean; criteria?: ReadinessCriterion[] } | null;
  creator_agent_id: string | null;
  is_watching: boolean;
  my_role: Role;
  parent: { id: string; ref_key: string; title: string } | null;
}

export interface RequirementPage {
  total: number;
  items: RequirementSummary[];
}

export interface BoardCard {
  id: string;
  ref_key: string | null;
  title: string;
  tracker_id: string;
  tracker_key: string;
  tracker_icon: string | null;
  status_id: string;
  is_closed: boolean;
  priority_id: string;
  priority_key: string;
  priority_name: string;
  priority_color: string | null;
  lead_user_id: string | null;
  board_position: number;
  start_date: DateOnly | null;
  due_date: DateOnly | null;
  done_ratio: number;
  readiness_score: number | null;
  updated_at: string;
  claimed_by_agent_id: string | null;
  claimed_by_agent_name: string | null;
  labels: LabelRef[];
  members: CardMember[];
  comment_count: number;
  attachment_count: number;
  children_count: number;
  children_done: number;
}

export interface BoardColumn {
  id: string;
  status_id: string;
  status_key: string;
  name: string;
  color: string | null;
  ord: number;
  wip_limit: number | null;
  is_collapsed: boolean;
  is_closed: boolean;
  is_agent_claimable: boolean;
  requires_resolution: boolean;
  total: number;
  cards: BoardCard[];
}

export interface Board {
  id: string;
  space_id: string;
  name: string;
  closed_days: number;
  columns: BoardColumn[];
  hidden_columns: { status_id: string; name: string }[];
}

export interface BoardSummary {
  id: string;
  space_id: string;
  name: string;
  description: string | null;
}

export interface Tracker {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  default_status_id: string | null;
  ord: number;
  is_active: boolean;
  is_agent_enabled: boolean;
  template_id: string | null;
  template_body_md: string | null;
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
  is_agent_claimable: boolean;
  requires_resolution: boolean;
}

export type JournalKind = 'comment' | 'change' | 'agent_event' | 'system';

export interface JournalDetail {
  type: string;
  property?: string;
  from?: unknown;
  to?: unknown;
  [k: string]: unknown;
}

export interface AttachmentRef {
  id: string;
  filename: string;
  content_type: string;
  byte_size: number;
  created_at: string;
}

export interface Journal {
  id: string;
  requirement_id: string;
  kind: JournalKind;
  actor_type: 'user' | 'agent' | 'system';
  actor_id: string | null;
  actor_name: string;
  actor_handle: string | null;
  actor_avatar_url: string | null;
  notes_md: string;
  details: JournalDetail[];
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  attachments: AttachmentRef[];
}

export interface Attachment extends AttachmentRef {
  document_id: string | null;
  journal_id: string | null;
  space_id: string;
  status: 'staged' | 'attached';
  is_inline: boolean;
  creator_id: string | null;
  creator_name: string | null;
}

export interface UploadedFile {
  id: string;
  filename: string;
  content_type: string;
  byte_size: number;
  url: string;
}

export interface Milestone {
  id: string;
  space_id: string;
  name: string;
  description: string | null;
  due_date: DateOnly | null;
  status: 'open' | 'locked' | 'closed';
  total?: number;
  closed?: number;
  avg_done_ratio?: number;
}

export interface Category {
  id: string;
  space_id: string;
  name: string;
  slug: string;
  description: string | null;
  default_user_id: string | null;
  ord: number;
}

export interface RequirementMember {
  subject_type: 'user' | 'agent';
  subject_id: string;
  is_lead: boolean;
  added_at: string;
  display_name: string;
  email: string;
  handle: string | null;
  avatar_url: string | null;
}

export interface SpaceMember {
  id: string;
  display_name: string;
  email: string;
  handle: string;
  avatar_url: string | null;
  role: Role;
  created_at: string;
}

export interface DocumentLink {
  id: string;
  source_id: string;
  target_id: string | null;
  direction: 'outgoing' | 'incoming';
  link_type: string;
  raw_link_type: string;
  other_id: string | null;
  target_title: string;
  target_slug: string | null;
  target_ref_key: string | null;
  target_space_id: string | null;
  target_type: string;
  target_status_name: string | null;
  target_status_color: string | null;
  target_is_closed: boolean | null;
  is_derived: boolean;
  source_journal_id: string | null;
  target_text: string | null;
  note: string;
  created_at: string;
}

export type DocType = 'folder' | 'note' | 'wiki' | 'requirement' | 'template';

export interface DocumentSummary {
  id: string;
  space_id: string;
  parent_id: string | null;
  doc_type: DocType;
  ref_key: string | null;
  slug: string;
  title: string;
  version: number;
  is_archived: boolean;
  archived_at: string | null;
  position: number;
  depth: number;
  word_count: number;
  created_at: string;
  updated_at: string;
  creator_id: string | null;
  creator_name: string | null;
  updater_id: string | null;
  updater_name: string | null;
  excerpt?: string;
  is_favorite: boolean;
  children_count?: number;
  labels: LabelRef[];
}

export interface Document extends DocumentSummary {
  body_md: string;
  front_matter: Record<string, unknown>;
  is_watching: boolean;
  my_role: Role;
  sections: { ord: number; level: number; heading: string; slug: string }[];
  breadcrumbs: { id: string; title: string }[];
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version: number;
  title: string;
  length?: number;
  body_md?: string;
  change_summary: string | null;
  actor_type: string;
  actor_id: string | null;
  actor_name?: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  document_id: string | null;
  journal_id: string | null;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  actor_name: string;
  actor_avatar_url: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  space_id: string | null;
  ref_key: string | null;
  title: string | null;
  doc_type: DocType | null;
}

export interface SuggestItem {
  kind: 'requirement' | 'document' | 'user';
  id: string;
  ref_key: string | null;
  title: string;
  subtitle: string | null;
  space_id: string;
  score: number;
}

export interface ResolvedRequirement {
  kind: 'requirement';
  id: string;
  ref_key: string;
  title: string;
  space_id: string;
  status_name: string;
  status_color: string | null;
  is_closed: boolean;
}
export interface ResolvedDocument {
  kind: 'document';
  id: string;
  title: string;
  doc_type: DocType;
  space_id: string;
  ref_key: string | null;
}
export interface ResolvedUser {
  kind: 'user';
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
}
export interface ResolvedRefs {
  requirements: Record<string, ResolvedRequirement>;
  documents: Record<string, ResolvedDocument>;
  users: Record<string, ResolvedUser>;
}

export interface SearchResult {
  id: string;
  space_id: string;
  space_key: string;
  doc_type: DocType;
  ref_key: string | null;
  title: string;
  status_name: string | null;
  snippet: string;
  rank: number;
  updated_at: string;
}

export type WorkItem = RequirementSummary & { space_key: string; space_name: string };
export interface MyWork {
  assigned: WorkItem[];
  overdue: WorkItem[];
  due_soon: WorkItem[];
  reported: WorkItem[];
  watching: WorkItem[];
  mentions: { id: string; document_id: string; journal_id: string | null; payload: Record<string, unknown>; created_at: string; read_at: string | null }[];
}

export interface SavedView {
  id: string;
  space_id: string;
  user_id: string | null;
  name: string;
  filters: Record<string, string>;
  is_shared: boolean;
  created_at: string;
}

export interface SystemUser {
  id: string;
  account_id: string;
  email: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  is_account_admin: boolean;
  locale: string;
  timezone: string;
  status: 'pending' | 'active' | 'suspended' | 'deleted';
  last_login_at: string | null;
  created_at: string;
}

export interface TimeEntry {
  id: string;
  document_id: string;
  user_id: string;
  display_name: string;
  hours: number;
  spent_on: DateOnly;
  note: string | null;
  created_at: string;
}

export interface Transition {
  id: string;
  tracker_id: string;
  from_status_id: string | null;
  to_status_id: string;
  allowed_roles: Role[];
  allowed_actors: ('user' | 'agent')[];
  requires_comment: boolean;
  requires_assignee: boolean;
  requires_readiness: boolean;
}

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  model_name: string | null;
  status: string;
  is_active: boolean;
  scopes: string[];
  api_key_prefix: string;
  last_seen_at: string | null;
  created_at: string;
  created_by_name?: string | null;
  active_claims?: number;
  api_key?: string;
}

export type QueueItem = RequirementSummary & { status_is_agent_claimable: boolean; is_claimed: boolean; claim_expires_at: string | null };
