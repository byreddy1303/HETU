import { describe, expect, it } from 'vitest';
import { sceneForPath } from '@/components/immersive/scene';
import { resolveSceneQuality } from '@/components/immersive/performance';

describe('authenticated immersive scene routing', () => {
  it.each([
    ['/', 'observatory'],
    ['/today', 'priority'],
    ['/capture', 'priority'],
    ['/pyq', 'archive'],
    ['/mocks', 'archive'],
    ['/session/new', 'focus'],
    ['/session/example/solve', 'focus'],
    ['/reattempts/question-1', 'orbit'],
    ['/planner', 'cartography'],
    ['/syllabus', 'cartography'],
    ['/buddy', 'connection'],
    ['/readiness', 'calibration'],
    ['/patterns', 'calibration'],
    ['/journal', 'ledger'],
    ['/formulas', 'ledger'],
    ['/settings', 'ledger']
  ])('maps %s to the %s evidence world', (pathname, world) => {
    const scene = sceneForPath(pathname);

    expect(scene.world).toBe(world);
    expect(scene.nodes.length).toBeGreaterThanOrEqual(4);
    expect(scene.title).not.toHaveLength(0);
  });
});

describe('immersive scene performance governor', () => {
  it('uses the essential scene when reduced motion is requested', () => {
    expect(resolveSceneQuality(true)).toBe('essential');
  });

  it('balances animation for constrained devices and data saver', () => {
    expect(
      resolveSceneQuality(false, {
        hardwareConcurrency: 4,
        connection: { saveData: false }
      } as Navigator & { connection: { saveData: boolean } })
    ).toBe('balanced');

    expect(
      resolveSceneQuality(false, {
        hardwareConcurrency: 12,
        connection: { saveData: true }
      } as Navigator & { connection: { saveData: boolean } })
    ).toBe('balanced');
  });

  it('uses the full scene on capable devices', () => {
    expect(
      resolveSceneQuality(false, {
        hardwareConcurrency: 12,
        deviceMemory: 16,
        connection: { saveData: false }
      } as Navigator & { deviceMemory: number; connection: { saveData: boolean } })
    ).toBe('full');
  });
});
