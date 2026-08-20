import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { sceneForPath } from '@/components/immersive/scene';
import { resolveSceneQuality } from '@/components/immersive/performance';
import { SceneContext } from '@/components/immersive/scene-context';
import { usePrefsStore } from '@/stores/prefs';
import { useMediaQuery } from '@/hooks/useMediaQuery';
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
  const previousOrderRef = useRef(0);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const soundEnabled = usePrefsStore((state) => state.immersiveSoundEnabled);
  const soundEnabledRef = useRef(soundEnabled);
  const config = useMemo(() => sceneForPath(pathname), [pathname]);
  const quality = useMemo(
    () =>
      resolveSceneQuality(reducedMotion, typeof navigator === 'undefined' ? undefined : navigator),
    [reducedMotion]
  );

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

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

    const previousOrder = previousOrderRef.current;
    previousOrderRef.current = config.order;
    root.dataset.sceneDirection = config.order < previousOrder ? 'reverse' : 'forward';
    root.classList.remove('is-scene-arriving');
    if (reducedMotion) return;

    const frame = window.requestAnimationFrame(() => root.classList.add('is-scene-arriving'));
    const timer = window.setTimeout(() => root.classList.remove('is-scene-arriving'), 920);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      root.classList.remove('is-scene-arriving');
    };
  }, [config.order, pathname, reducedMotion]);

  useEffect(() => {
    if (!soundEnabled) return;
    void import('@/components/immersive/sound-engine').then((engine) => {
      engine.playRouteCue(config.order);
    });
  }, [config.order, pathname, soundEnabled]);

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
    let maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
    let scrollProgress = maxScroll > 8 ? Math.min(window.scrollY / maxScroll, 1) : 0;
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
      renderSceneTransforms(elements, normalizedX, normalizedY, cappedScroll, scrollProgress);
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
      maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
      scrollProgress = maxScroll > 8 ? Math.min(window.scrollY / maxScroll, 1) : 0;
      renderSceneTransforms(elements, normalizedX, normalizedY, cappedScroll, scrollProgress);
    };

    const onScroll = () => {
      if (!scrollFrame) scrollFrame = window.requestAnimationFrame(commitScroll);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (quality !== 'essential') {
        root.style.setProperty('--scene-pulse-x', `${event.clientX}px`);
        root.style.setProperty('--scene-pulse-y', `${event.clientY}px`);
        elements.pulse.style.translate = `${event.clientX}px ${event.clientY}px`;
        root.classList.remove('is-scene-pulsing');
        window.requestAnimationFrame(() => root.classList.add('is-scene-pulsing'));
        window.clearTimeout(pulseTimer);
        pulseTimer = window.setTimeout(() => root.classList.remove('is-scene-pulsing'), 760);
      }

      const target = event.target instanceof Element ? event.target : null;
      const isInteractive = Boolean(
        target?.closest('a, button, input, select, textarea, [role="button"], .u-tactile-tile')
      );
      if (soundEnabledRef.current && event.isPrimary && isInteractive) {
        void import('@/components/immersive/sound-engine').then((engine) => {
          engine.playInteractionCue(event.clientY / Math.max(window.innerHeight, 1));
        });
      }
    };

    const onResize = () => {
      maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
      scrollProgress = maxScroll > 8 ? Math.min(window.scrollY / maxScroll, 1) : 0;
      if (!pointerFrame) pointerFrame = window.requestAnimationFrame(commitPointer);
    };

    const onVisibilityChange = () => {
      root.dataset.scenePaused = document.hidden ? 'true' : 'false';
    };

    const tracksPointer =
      quality === 'full' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!reducedMotion) {
      renderSceneTransforms(elements, normalizedX, normalizedY, cappedScroll, scrollProgress);
      if (tracksPointer) window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize, { passive: true });
    }
    if (reducedMotion) renderSceneTransforms(elements, 0, 0, 0, scrollProgress);
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    const resizeObserver =
      quality === 'essential' || typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
            scrollProgress = maxScroll > 8 ? Math.min(window.scrollY / maxScroll, 1) : 0;
            if (!scrollFrame) scrollFrame = window.requestAnimationFrame(commitScroll);
          });
    resizeObserver?.observe(document.documentElement);

    return () => {
      if (tracksPointer) window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      resizeObserver?.disconnect();
      activeSurface?.style.removeProperty('transform');
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      window.clearTimeout(pulseTimer);
    };
  }, [pathname, quality, reducedMotion]);

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
