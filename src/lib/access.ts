import { apiRequest } from '@/lib/fastapi-client';

export interface InvitePreview {
  valid: true;
  email: string | null;
}

export interface InviteSignupInput {
  invite_token: string;
  name: string;
  username: string;
  email: string;
  password: string;
}

export interface InviteSignupResult {
  ok: true;
  user_id: string;
}

export function inspectInvite(token: string, signal?: AbortSignal): Promise<InvitePreview> {
  return apiRequest<InvitePreview>(`/v1/access/invites/${encodeURIComponent(token)}`, {
    signal
  }, { public: true });
}

export function signupWithInvite(input: InviteSignupInput): Promise<InviteSignupResult> {
  return apiRequest<InviteSignupResult>('/v1/access/signup', {
    method: 'POST',
    body: JSON.stringify(input)
  }, { public: true });
}
