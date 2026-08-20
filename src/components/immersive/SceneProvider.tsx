import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { sceneForPath } from '@/components/immersive/scene';
import { resolveSceneQuality } from '@/components/immersive/performance';
import { SceneContext } from '@/components/immersive/scene-context';
import {
  collectSceneElements,
  HOVER_SURFACE_SELECTOR,
  PARALLAX_TARGET_SELECTOR,
  renderSceneTransforms,
  updateParallaxTargets
} from '@/components/immersive/scene-runtime';

export function SceneProvider({ pathname, children }: { pathname: string; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const parallaxTargetsRef = useRef<HTMLElement[]>([]);
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion = prefersReducedMotion === true;
  const config = useMemo(() => sceneForPath(pathname), [pathname]);
  const quality = useMemo(
    () =>
      resolveSceneQuality(reducedMotion, typeof navigator === 'undefined' ? undefined : navigator),
    [reducedMotion]
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const root = rootRef.current;
      parallaxTargetsRef.current = root
        ? Array.from(root.querySelectorAll<HTMLElement>(PARALLAX_TARGET_SELECTOR))
        : [];
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const elements = collectSceneElements(root);
    if (!elements) return;

    let pointerFrame = 0;
    let scrollFrame = 0;
    let pulseTimer = 0;
    let latestX = window.innerWidth / 2;
    let latestY = window.innerHeight / 2;
    let normalizedX = 0;
    let normalizedY = 0;
    let cappedScroll = Math.min(window.scrollY, 900);
    let activeSurface: HTMLElement | null = null;

    const commitPointer = () => {
      pointerFrame = 0;
      const width = Math.max(window.innerWidth, 1);
      const height = Math.max(window.innerHeight, 1);
      normalizedX = (latestX / width - 0.5) * 2;
      normalizedY = (latestY / height - 0.5) * 2;
      elements.cursor.style.transform = `translate3d(${latestX.toFixed(1)}px, ${latestY.toFixed(
        1
      )}px, 0) translate(-50%, -50%)`;
      renderSceneTransforms(elements, normalizedX, normalizedY, cappedScroll);
      updateParallaxTargets(parallaxTargetsRef.current, activeSurface, normalizedX, normalizedY);
    };

    const onPointerMove = (event: PointerEvent) => {
      latestX = event.clientX;
      latestY = event.clientY;
      const eventTarget = event.target instanceof Element ? event.target : null;
      let nextSurface = eventTarget?.closest<HTMLElement>(HOVER_SURFACE_SELECTOR) ?? null;
      if (nextSurface && !root.contains(nextSurface)) nextSurface = null;
      if (activeSurface && activeSurface !== nextSurface) {
        activeSurface.style.removeProperty('transform');
      }
      activeSurface = nextSurface;
      if (!pointerFrame) pointerFrame = window.requestAnimationFrame(commitPointer);
    };

    const commitScroll = () => {
      scrollFrame = 0;
      cappedScroll = Math.min(window.scrollY, 900);
      renderSceneTransforms(elements, normalizedX, normalizedY, cappedScroll);
    };

    const onScroll = () => {
      if (!scrollFrame) scrollFrame = window.requestAnimationFrame(commitScroll);
    };

    const onPointerDown = (event: PointerEvent) => {
      root.style.setProperty('--scene-pulse-x', `${event.clientX}px`);
      root.style.setProperty('--scene-pulse-y', `${event.clientY}px`);
      elements.pulse.style.translate = `${event.clientX}px ${event.clientY}px`;
      root.classList.remove('is-scene-pulsing');
      window.requestAnimationFrame(() => root.classList.add('is-scene-pulsing'));
      window.clearTimeout(pulseTimer);
      pulseTimer = window.setTimeout(() => root.classList.remove('is-scene-pulsing'), 760);
    };

    const onResize = () => {
      if (!pointerFrame) pointerFrame = window.requestAnimationFrame(commitPointer);
    };

    const onVisibilityChange = () => {
      root.dataset.scenePaused = document.hidden ? 'true' : 'false';
    };

    const tracksPointer =
      !reducedMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!reducedMotion) {
      renderSceneTransforms(elements, normalizedX, normalizedY, cappedScroll);
      if (tracksPointer) window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize, { passive: true });
    }
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (tracksPointer) window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      window.clearTimeout(pulseTimer);
    };
  }, [pathname, reducedMotion]);

  const value = useMemo(
    () => ({ config, quality, reducedMotion }),
    [config, quality, reducedMotion]
  );

  return (
    <SceneContext.Provider value={value}>
      <div
        ref={rootRef}
        className="immersive-shell min-h-dvh"
        data-scene-world={config.world}
        data-scene-quality={quality}
        data-scene-paused="false"
      >
        {children}
      </div>
    </SceneContext.Provider>
  );
}
