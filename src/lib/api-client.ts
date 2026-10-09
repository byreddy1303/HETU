import { backendConfig } from '@/lib/backend-config';
import { fastapiClient } from '@/lib/fastapi-client';
export type { ApiUser } from '@/lib/fastapi-client';
export type { RealtimeChannel } from '@/lib/fastapi-realtime';

// Unit tests can seed RAM without credentials. Every deployed build requires
// the online API; missing configuration never enables device-only writes.
export const apiConfigured = import.meta.env.MODE !== 'test' || !backendConfig.error;
export const apiClient = fastapiClient;
