export const PARALLAX_TARGET_SELECTOR = [
  '.immersive-dashboard-hero',
  '.immersive-metric-card--surface',
  '.immersive-metric-card--pulse',
  '.immersive-metric-card--focus',
  '.immersive-metric-card--session',
  '.immersive-learning-signal'
].join(',');

export const HOVER_SURFACE_SELECTOR = '.u-panel, .native-learning-tips';

export interface SceneElements {
  wash: HTMLElement;
  grid: HTMLElement;
  thread: SVGElement;
  orbits: HTMLElement[];
  core: HTMLElement;
  evidence: HTMLElement[];
  cursor: HTMLElement;
  pulse: HTMLElement;
}

export function collectSceneElements(root: HTMLElement): SceneElements | null {
  const scene = root.querySelector<HTMLElement>('.immersive-scene');
  const wash = scene?.querySelector<HTMLElement>('.immersive-scene__wash');
  const grid = scene?.querySelector<HTMLElement>('.immersive-scene__grid');
  const thread = scene?.querySelector<SVGElement>('.immersive-thread');
  const core = scene?.querySelector<HTMLElement>('.immersive-focus-core');
  const cursor = scene?.querySelector<HTMLElement>('.immersive-scene__cursor');
  const pulse = scene?.querySelector<HTMLElement>('.immersive-scene__pulse');

  if (!scene || !wash || !grid || !thread || !core || !cursor || !pulse) return null;

  return {
    wash,
    grid,
    thread,
    orbits: Array.from(scene.querySelectorAll<HTMLElement>('.immersive-orbit')),
    core,
    evidence: Array.from(scene.querySelectorAll<HTMLElement>('.immersive-evidence')),
    cursor,
    pulse
  };
}

function evidenceRotation(node: HTMLElement) {
  if (node.classList.contains('immersive-evidence--north-west')) return -2;
  if (node.classList.contains('immersive-evidence--north-east')) return 1.4;
  if (node.classList.contains('immersive-evidence--mid-left')) return 1.2;
  if (node.classList.contains('immersive-evidence--mid-right')) return -1.4;
  if (node.classList.contains('immersive-evidence--south-left')) return -1;
  return 2;
}

export function renderSceneTransforms(
  elements: SceneElements,
  normalizedX: number,
  normalizedY: number,
  scroll: number
) {
  const farX = normalizedX * 4;
  const farY = normalizedY * 3;
  const midX = normalizedX * 8;
  const midY = normalizedY * 6;
  const nearX = normalizedX * 14;
  const nearY = normalizedY * 10;
  const scrollFar = scroll * -0.018;
  const scrollGrid = scroll * -0.12;
  const scrollThread = scroll * -0.035;
  const scrollOrbit = scroll * -0.026;
  const scrollCore = scroll * -0.014;
  const scrollNode = scroll * -0.02;
  const mobile = window.innerWidth <= 767;

  elements.wash.style.transform = `translate3d(${(-normalizedX * 10).toFixed(2)}px, ${(
    -normalizedY * 8 +
    scrollFar
  ).toFixed(2)}px, 0) scale(1.04)`;
  elements.grid.style.transform = `rotateX(${mobile ? 66 : 64}deg) rotateZ(${mobile ? -8 : -9}deg) translate3d(${(-nearX).toFixed(
    2
  )}px, ${(scrollGrid - nearY).toFixed(2)}px, -90px)`;
  elements.thread.style.transform = `translate3d(${midX.toFixed(2)}px, ${(
    scrollThread + farY
  ).toFixed(2)}px, 0)`;

  for (const orbit of elements.orbits) {
    orbit.style.translate = `calc(-50% + ${midX.toFixed(2)}px) calc(-50% + ${(
      midY + scrollOrbit
    ).toFixed(2)}px)`;
  }

  elements.core.style.translate = `calc(-50% + ${farX.toFixed(2)}px) calc(-50% + ${(
    farY + scrollCore
  ).toFixed(2)}px)`;

  for (const node of elements.evidence) {
    const depth = Number(node.dataset.depth);
    const nodeX = depth === 3 ? nearX : depth === 2 ? midX : farX;
    const nodeY = depth === 3 ? nearY : depth === 2 ? midY : farY;
    node.style.transform = `translate3d(${nodeX.toFixed(2)}px, ${(nodeY + scrollNode).toFixed(
      2
    )}px, 0) rotate(${evidenceRotation(node)}deg)`;
  }
}

export function updateParallaxTargets(
  targets: HTMLElement[],
  activeSurface: HTMLElement | null,
  normalizedX: number,
  normalizedY: number
) {
  const farX = normalizedX * 4;
  const inverseFarX = -farX;
  const tiltX = normalizedY * -0.45;
  const tiltY = normalizedX * 0.45;

  for (const target of targets) {
    if (target.classList.contains('immersive-dashboard-hero')) {
      const transform =
        target === activeSurface
          ? `translate3d(${(normalizedX * 1.8).toFixed(2)}px, -3px, 18px) rotateX(${tiltX.toFixed(
              3
            )}deg) rotateY(${tiltY.toFixed(3)}deg)`
          : `translate3d(${inverseFarX.toFixed(2)}px, 0, 0)`;
      target.style.setProperty('transform', transform, 'important');
    } else if (target.classList.contains('immersive-metric-card--surface')) {
      target.style.transform = `rotateZ(-0.18deg) translate3d(${inverseFarX.toFixed(2)}px, 0, 0)`;
    } else if (target.classList.contains('immersive-metric-card--pulse')) {
      target.style.transform = `rotateZ(0.3deg) translate3d(${farX.toFixed(2)}px, 1px, 0)`;
    } else if (target.classList.contains('immersive-metric-card--focus')) {
      target.style.transform = `rotateZ(0.25deg) translate3d(${inverseFarX.toFixed(2)}px, 0, 0)`;
    } else if (target.classList.contains('immersive-metric-card--session')) {
      target.style.transform = `rotateZ(-0.16deg) translate3d(${farX.toFixed(2)}px, 0, 0)`;
    } else {
      target.style.transform = `translate3d(${inverseFarX.toFixed(2)}px, 0, 0)`;
    }
  }

  if (activeSurface && !activeSurface.classList.contains('immersive-dashboard-hero')) {
    activeSurface.style.transform = `translate3d(${(normalizedX * 2).toFixed(2)}px, ${(
      -3 + normalizedY
    ).toFixed(2)}px, 18px) rotateX(${tiltX.toFixed(3)}deg) rotateY(${tiltY.toFixed(3)}deg)`;
  }
}
