import { beforeEach, describe, expect, it } from 'vitest';
import {
  buddyPushOptedIn,
  getPushDeviceId,
  routeFromPushData,
  urlBase64ToUint8Array
} from '@/lib/buddyNotifications';

describe('Buddy notification client helpers', () => {
  beforeEach(() => localStorage.clear());

  it('keeps a stable device id for one app installation', () => {
    const first = getPushDeviceId();
    const second = getPushDeviceId();
    expect(second).toBe(first);
    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('defaults to opted out until the learner explicitly enables alerts', () => {
    expect(buddyPushOptedIn()).toBe(false);
    localStorage.setItem('air:buddy-push-opt-in', 'true');
    expect(buddyPushOptedIn()).toBe(true);
  });

  it('converts URL-safe VAPID keys to bytes', () => {
    expect(Array.from(urlBase64ToUint8Array('AQIDBA'))).toEqual([1, 2, 3, 4]);
  });

  it('accepts only local notification routes', () => {
    expect(routeFromPushData({ route: '/buddy?chat=abc' })).toBe('/buddy?chat=abc');
    expect(routeFromPushData({ route: 'https://attacker.example' })).toBeNull();
    expect(routeFromPushData({ route: '//attacker.example' })).toBeNull();
    expect(routeFromPushData(null)).toBeNull();
  });
});
