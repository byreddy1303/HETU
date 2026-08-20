import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { sceneForPath } from '@/components/immersive/scene';
import { resolveSceneQuality } from '@/components/immersive/performance';
import { SceneContext } from '@/components/immersive/scene-context';

export function SceneProvider({ pathname, children }: { pathname: string; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion = prefersReducedMotion === true;
  const config = useMemo(() => sceneForPath(pathname), [pathname]);
  const quality = resolveSceneQuality(
    reducedMotion,
    typeof navigator === 'undefined' ? undefined : navigator
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let pointerFrame = 0;
    let scrollFrame = 0;
    let pulseTimer = 0;
    let latestX = window.innerWidth / 2;
    let latestY = window.innerHeight / 2;

    const commitPointer = () => {
      pointerFrame = 0;
      const width = Math.max(window.innerWidth, 1);
      const height = Math.max(window.innerHeight, 1);
      const normalizedX = (latestX / width - 0.5) * 2;
      const normalizedY = (latestY / height - 0.5) * 2;
      root.style.setProperty('--scene-x', normalizedX.toFixed(4));
      root.style.setProperty('--scene-y', normalizedY.toFixed(4));
      root.style.setProperty('--scene-far-x', `${(normalizedX * 4).toFixed(2)}px`);
      root.style.setProperty('--scene-far-y', `${(normalizedY * 3).toFixed(2)}px`);
      root.style.setProperty('--scene-mid-x', `${(normalizedX * 8).toFixed(2)}px`);
      root.style.setProperty('--scene-mid-y', `${(normalizedY * 6).toFixed(2)}px`);
      root.style.setProperty('--scene-near-x', `${(normalizedX * 14).toFixed(2)}px`);
      root.style.setProperty('--scene-near-y', `${(normalizedY * 10).toFixed(2)}px`);
      root.style.setProperty('--scene-far-x-inverse', `${(normalizedX * -4).toFixed(2)}px`);
      root.style.setProperty('--scene-mid-x-inverse', `${(normalizedX * -8).toFixed(2)}px`);
      root.style.setProperty('--scene-near-x-inverse', `${(normalizedX * -14).toFixed(2)}px`);
      root.style.setProperty('--scene-wash-x', `${(normalizedX * -10).toFixed(2)}px`);
      root.style.setProperty('--scene-wash-y', `${(normalizedY * -8).toFixed(2)}px`);
      root.style.setProperty('--scene-wash-focus-x', `${(68 + normalizedX * 4).toFixed(2)}%`);
      root.style.setProperty('--scene-wash-focus-y', `${(32 + normalizedY * 3).toFixed(2)}%`);
      root.style.setProperty('--scene-wash-echo-x', `${(30 - normalizedX * 3).toFixed(2)}%`);
      root.style.setProperty('--scene-wash-echo-y', `${(72 - normalizedY * 3).toFixed(2)}%`);
      root.style.setProperty('--scene-panel-x', `${(normalizedX * 2).toFixed(2)}px`);
      root.style.setProperty('--scene-panel-y', `${(-3 + normalizedY).toFixed(2)}px`);
      root.style.setProperty('--scene-hero-x', `${(normalizedX * 1.8).toFixed(2)}px`);
      root.style.setProperty('--scene-tilt-x', `${(normalizedY * -0.45).toFixed(3)}deg`);
      root.style.setProperty('--scene-tilt-y', `${(normalizedX * 0.45).toFixed(3)}deg`);
      root.style.setProperty('--scene-cursor-x', `${latestX.toFixed(1)}px`);
      root.style.setProperty('--scene-cursor-y', `${latestY.toFixed(1)}px`);
    };

    const onPointerMove = (event: PointerEvent) => {
      latestX = event.clientX;
      latestY = event.clientY;
      if (!pointerFrame) pointerFrame = window.requestAnimationFrame(commitPointer);
    };

    const commitScroll = () => {
      scrollFrame = 0;
      const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(window.scrollY / max, 1);
      const cappedScroll = Math.min(window.scrollY, 900);
      root.style.setProperty('--scene-scroll', progress.toFixed(4));
      root.style.setProperty('--scene-scroll-far', `${(cappedScroll * -0.018).toFixed(2)}px`);
      root.style.setProperty('--scene-scroll-grid', `${(cappedScroll * -0.12).toFixed(2)}px`);
      root.style.setProperty('--scene-scroll-thread', `${(cappedScroll * -0.035).toFixed(2)}px`);
      root.style.setProperty('--scene-scroll-orbit', `${(cappedScroll * -0.026).toFixed(2)}px`);
      root.style.setProperty('--scene-scroll-core', `${(cappedScroll * -0.014).toFixed(2)}px`);
      root.style.setProperty('--scene-scroll-node', `${(cappedScroll * -0.02).toFixed(2)}px`);
    };

    const onScroll = () => {
      if (!scrollFrame) scrollFrame = window.requestAnimationFrame(commitScroll);
    };

    const onPointerDown = (event: PointerEvent) => {
      root.style.setProperty('--scene-pulse-x', `${event.clientX}px`);
      root.style.setProperty('--scene-pulse-y', `${event.clientY}px`);
      root.classList.remove('is-scene-pulsing');
      window.requestAnimationFrame(() => root.classList.add('is-scene-pulsing'));
      window.clearTimeout(pulseTimer);
      pulseTimer = window.setTimeout(() => root.classList.remove('is-scene-pulsing'), 760);
    };

    const onVisibilityChange = () => {
      root.dataset.scenePaused = document.hidden ? 'true' : 'false';
    };

    commitPointer();
    commitScroll();
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      window.clearTimeout(pulseTimer);
    };
  }, []);

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
        style={
          {
            '--scene-x': 0,
            '--scene-y': 0,
            '--scene-scroll': 0,
            '--scene-far-x': '0px',
            '--scene-far-y': '0px',
            '--scene-mid-x': '0px',
            '--scene-mid-y': '0px',
            '--scene-near-x': '0px',
            '--scene-near-y': '0px',
            '--scene-far-x-inverse': '0px',
            '--scene-mid-x-inverse': '0px',
            '--scene-near-x-inverse': '0px',
            '--scene-wash-x': '0px',
            '--scene-wash-y': '0px',
            '--scene-wash-focus-x': '68%',
            '--scene-wash-focus-y': '32%',
            '--scene-wash-echo-x': '30%',
            '--scene-wash-echo-y': '72%',
            '--scene-panel-x': '0px',
            '--scene-panel-y': '-3px',
            '--scene-hero-x': '0px',
            '--scene-tilt-x': '0deg',
            '--scene-tilt-y': '0deg',
            '--scene-scroll-far': '0px',
            '--scene-scroll-grid': '0px',
            '--scene-scroll-thread': '0px',
            '--scene-scroll-orbit': '0px',
            '--scene-scroll-core': '0px',
            '--scene-scroll-node': '0px',
            '--scene-cursor-x': '50vw',
            '--scene-cursor-y': '50vh'
          } as CSSProperties
        }
      >
        {children}
      </div>
    </SceneContext.Provider>
  );
}
