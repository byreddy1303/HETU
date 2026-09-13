import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearTrustedDevice,
  hasTrustedDevice,
  readTrustedDevice,
  rememberTrustedDevice
} from '@/lib/device-trust';

describe('device-trust (remember this device)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a trusted-device record', () => {
    rememberTrustedDevice({
      userId: '11111111-1111-4111-8111-111111111111',
      username: 'alex',
      refreshToken: 'rt-1'
    });

    expect(hasTrustedDevice()).toBe(true);
    expect(readTrustedDevice()).toMatchObject({
      version: 1,
      userId: '11111111-1111-4111-8111-111111111111',
      username: 'alex',
      refreshToken: 'rt-1'
    });
  });

  it('latest login wins (single slot per browser)', () => {
    rememberTrustedDevice({
      userId: '11111111-1111-4111-8111-111111111111',
      username: 'alex',
      refreshToken: 'rt-1'
    });
    rememberTrustedDevice({
      userId: '22222222-2222-4222-8222-222222222222',
      username: 'bea',
      refreshToken: 'rt-2'
    });

    expect(readTrustedDevice()).toMatchObject({
      userId: '22222222-2222-4222-8222-222222222222',
      username: 'bea',
      refreshToken: 'rt-2'
    });
  });

  it('ignores malformed, missing, or non-matching records', () => {
    localStorage.setItem('air.device-trust', 'not-json{');
    expect(readTrustedDevice()).toBeNull();

    localStorage.setItem('air.device-trust', JSON.stringify({ version: 99, userId: 'x' }));
    expect(readTrustedDevice()).toBeNull();

    localStorage.setItem(
      'air.device-trust',
      JSON.stringify({
        version: 1,
        userId: '11111111-1111-4111-8111-111111111111',
        username: 'alex',
        refreshToken: '',
        trustedAt: new Date().toISOString()
      })
    );
    expect(readTrustedDevice()).toBeNull();

    localStorage.removeItem('air.device-trust');
    expect(readTrustedDevice()).toBeNull();
  });

  it('refuses to store incomplete records', () => {
    rememberTrustedDevice({ userId: '', username: 'alex', refreshToken: 'rt-1' });
    expect(hasTrustedDevice()).toBe(false);

    rememberTrustedDevice({ userId: 'u', username: 'alex', refreshToken: '  ' });
    expect(hasTrustedDevice()).toBe(false);
  });

  it('clear removes the record', () => {
    rememberTrustedDevice({
      userId: '11111111-1111-4111-8111-111111111111',
      username: 'alex',
      refreshToken: 'rt-1'
    });
    expect(hasTrustedDevice()).toBe(true);

    clearTrustedDevice();

    expect(hasTrustedDevice()).toBe(false);
    expect(readTrustedDevice()).toBeNull();
  });
});