import { describe, expect, it } from 'vitest';
import { sceneForPath } from '@/components/immersive/scene';
import { resolveSceneQuality } from '@/components/immersive/performance';
import {
  collectSceneElements,
  renderSceneTransforms,
  updateParallaxTargets
} from '@/components/immersive/scene-runtime';

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

describe('immersive scene compositor runtime', () => {
  it('writes bounded transforms directly to the moving layers', () => {
    document.body.innerHTML = `
      <div id="root">
        <div class="immersive-scene">
          <div class="immersive-scene__wash"></div>
          <div class="immersive-scene__grid"></div>
          <div class="immersive-scene__cursor"></div>
          <div class="immersive-scene__pulse"></div>
          <svg class="immersive-thread"></svg>
          <div class="immersive-orbit"></div>
          <div class="immersive-focus-core"></div>
          <div class="immersive-evidence immersive-evidence--mid-right" data-depth="3"></div>
        </div>
      </div>
    `;

    const root = document.querySelector<HTMLElement>('#root');
    expect(root).not.toBeNull();
    const elements = collectSceneElements(root!);
    expect(elements).not.toBeNull();

    renderSceneTransforms(elements!, 0.5, -0.5, 100);

    expect(elements!.wash.style.transform).toBe('translate3d(-5.00px, 2.20px, 0) scale(1.04)');
    expect(elements!.grid.style.transform).toContain('translate3d(-7.00px, -7.00px, -90px)');
    expect(elements!.thread.style.transform).toBe('translate3d(4.00px, -5.00px, 0)');
    expect(elements!.core.style.translate).toBe('calc(-50% + 2.00px) calc(-50% + -2.90px)');
    expect(elements!.evidence[0].style.transform).toBe(
      'translate3d(7.00px, -7.00px, 0) rotate(-1.4deg)'
    );
  });

  it('keeps dashboard parallax and hover depth on compositor transforms', () => {
    const hero = document.createElement('div');
    hero.className = 'immersive-dashboard-hero';
    const metric = document.createElement('div');
    metric.className = 'immersive-metric-card--pulse';

    updateParallaxTargets([hero, metric], hero, 0.5, -0.5);

    expect(hero.style.getPropertyPriority('transform')).toBe('important');
    expect(hero.style.transform).toContain('translate3d(0.90px, -3px, 18px)');
    expect(metric.style.transform).toBe('rotateZ(0.3deg) translate3d(2.00px, 1px, 0)');
  });
});
