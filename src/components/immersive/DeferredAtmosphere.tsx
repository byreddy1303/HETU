import { lazy, Suspense, useEffect, useState } from 'react';
import type { SceneWorld } from '@/components/immersive/scene';
import { useImmersiveScene } from '@/components/immersive/scene-context';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const WebGLAtmosphere = lazy(() => import('@/components/immersive/WebGLAtmosphere'));

interface IdleWindow {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
}

/**
 * Keeps the initial render path free of WebGL code. The procedural atmosphere
 * is an optional enhancement for capable desktop devices and is requested only
 * after the browser has finished urgent work.
 */
export default function DeferredAtmosphere({ world }: { world: SceneWorld }) {
  const { quality, reducedMotion } = useImmersiveScene();
  const [ready, setReady] = useState(false);
  const supportsFullScene = useMediaQuery(
    '(min-width: 900px) and (hover: hover) and (pointer: fine)'
  );

  useEffect(() => {
    const eligible = quality === 'full' && !reducedMotion && supportsFullScene;

    if (!eligible) {
      setReady(false);
      return;
    }

    const idleWindow = window as unknown as IdleWindow;
    const handle = idleWindow.requestIdleCallback
      ? idleWindow.requestIdleCallback(() => setReady(true), { timeout: 1800 })
      : window.setTimeout(() => setReady(true), 700);

    return () => {
      if (idleWindow.cancelIdleCallback && idleWindow.requestIdleCallback) {
        idleWindow.cancelIdleCallback(handle);
      } else {
        window.clearTimeout(handle);
      }
    };
  }, [quality, reducedMotion, supportsFullScene]);

  return ready ? (
    <Suspense fallback={null}>
      <WebGLAtmosphere world={world} />
    </Suspense>
  ) : null;
}
