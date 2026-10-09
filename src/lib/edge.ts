// Public and owner operations all go through the Python API.
import { apiClient } from '@/lib/api-client';
import { apiRequest, normalizeError } from '@/lib/fastapi-client';

async function fastapiEdge<T>(path: string, body: unknown, isPublic = false): Promise<T | EdgeError> {
  try {
    return await apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) }, { public: isPublic });
  } catch (error) {
    const detail = normalizeError(error);
    return { ok: false, status: detail.status ?? 0, error: detail.message };
  }
}

export interface RequestAccessInput {
  name: string;
  email: string;
  purpose: string;
  /** Honeypot — leave empty. */
  website?: string;
}

export interface RequestAccessOk {
  ok: true;
  id?: string;
  dedup?: boolean;
}

export interface EdgeError {
  ok: false;
  status: number;
  error: string;
}

export async function requestAccess(input: RequestAccessInput): Promise<RequestAccessOk | EdgeError> {
  return fastapiEdge('/v1/access/request', input, true);
}

export interface ApproveResult {
  ok: true;
  invite_id: string;
  invite_url: string;
  mail_sent: boolean;
  mail_error?: string;
}

export async function approveRequest(requestId: string): Promise<ApproveResult | EdgeError> {
  return fastapiEdge(`/v1/access/${encodeURIComponent(requestId)}/approve`, {});
}

export interface DeclineResult {
  ok: true;
  mail_sent: boolean;
  mail_error?: string;
}

export async function declineRequest(requestId: string, opts: { reason?: string; notify?: boolean } = {}): Promise<DeclineResult | EdgeError> {
  return fastapiEdge(`/v1/access/${encodeURIComponent(requestId)}/decline`, opts);
}

export function isEdgeError(x: unknown): x is EdgeError {
  return typeof x === 'object' && x !== null && (x as { ok?: boolean }).ok === false;
}

export type BuddyRequestStatus =
  | 'sent'
  | 'new'
  | 'reopened'
  | 'already_pending'
  | 'active'
  | 'cooldown'
  | 'rate_limit'
  | 'self'
  | 'no_such_user'
  | 'invalid_username';

export interface BuddyRequestOk {
  ok: true;
  exists: boolean;
  status: BuddyRequestStatus;
  created: boolean;
}

export async function sendBuddyRequest(username: string): Promise<BuddyRequestOk | EdgeError> {
  const { data, error } = await apiClient.rpc<BuddyRequestOk>('send_buddy_request', { username });
  return error || !data ? { ok: false, status: error?.status ?? 0, error: error?.message ?? 'Buddy request failed.' } : data;
}
