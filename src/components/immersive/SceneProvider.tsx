import { useEffect, useMemo, type ReactNode } from 'react';
import { sceneForPath } from '@/components/immersive/scene';
import { usePrefsStore } from '@/stores/prefs';

/**
 * Supplies the route-specific colour world without running a permanent visual
 * simulation. The previous implementation observed the document, rewrote
 * transforms on pointer/scroll frames, and kept WebGL/CSS animation work alive
 * on every authenticated screen. A static scene shell preserves the visual
 * identity while leaving the main thread and compositor available to the app.
 */
export function SceneProvider({ pathname, children }: { pathname: string; children: ReactNode }) {
  const soundEnabled = usePrefsStore((state) => state.immersiveSoundEnabled);
  const config = useMemo(() => sceneForPath(pathname), [pathname]);

  useEffect(() => {
    if (!soundEnabled) return;
    void import('@/components/immersive/sound-engine').then((engine) => {
      engine.playRouteCue(config.order);
    });
  }, [config.order, soundEnabled]);

  useEffect(() => {
    if (!soundEnabled) return;

    const playInteractiveCue = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        !event.isPrimary ||
        !target?.closest('a, button, input, select, textarea, [role="button"], .u-tactile-tile')
      ) {
        return;
      }

      void import('@/components/immersive/sound-engine').then((engine) => {
        engine.playInteractionCue(event.clientY / Math.max(window.innerHeight, 1));
      });
    };

    window.addEventListener('pointerdown', playInteractiveCue, { passive: true });
    return () => window.removeEventListener('pointerdown', playInteractiveCue);
  }, [soundEnabled]);

  return (
    <div
      className="immersive-shell min-h-dvh"
      data-scene-world={config.world}
      data-scene-quality="essential"
    >
      {children}
    </div>
  );
}
