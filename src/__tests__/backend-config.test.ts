import { afterEach, describe, expect, it, vi } from 'vitest';
import { readBackendConfig, isValidApiUrl } from '@/lib/backend-config';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe('backend rollout configuration', () => {
  it('requires explicit opt-in even when staging keys are present', () => {
    expect(readBackendConfig({ VITE_API_URL: '/api', VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_synthetic' }).fastapi).toBe(false);
    expect(readBackendConfig({}).backend).toBe('supabase');
  });
  it.each(['/api', 'http://localhost:8000', 'https://api.example.com/base/'])('accepts API base %s', (url) => expect(isValidApiUrl(url)).toBe(true));
  it.each(['//evil.example', '/api?token=x', '/\\evil.example', 'javascript:alert(1)', 'https://user:secret@api.example.com', 'https://api.example.com/#x', 'placeholder'])('rejects ambiguous or unsafe API base %s', (url) => expect(isValidApiUrl(url)).toBe(false));
  it('reports invalid selected configuration instead of falling back', async () => {
    expect(readBackendConfig({ VITE_BACKEND: 'fastapi' }).error).toBeTruthy();
    expect(readBackendConfig({ VITE_BACKEND: 'typo' }).error).toBeTruthy();
    vi.stubEnv('VITE_BACKEND', 'fastapi');
    const { supabaseConfigured, supabase } = await import('@/lib/supabase');
    expect(supabaseConfigured).toBe(true);
    expect((await supabase.from('sessions').upsert({ id: 's1' })).error).toBeTruthy();
  });
});
