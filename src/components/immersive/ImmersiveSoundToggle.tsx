import { useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { usePrefsStore } from '@/stores/prefs';
import { cn } from '@/lib/utils';

let soundEnginePromise: Promise<typeof import('@/components/immersive/sound-engine')> | null = null;

function loadSoundEngine() {
  soundEnginePromise ??= import('@/components/immersive/sound-engine');
  return soundEnginePromise;
}

export default function ImmersiveSoundToggle({ className }: { className?: string }) {
  const enabled = usePrefsStore((state) => state.immersiveSoundEnabled);
  const setPreference = usePrefsStore((state) => state.set);
  const pendingRef = useRef(false);

  const toggle = () => {
    if (pendingRef.current) return;

    if (enabled) {
      setPreference('immersiveSoundEnabled', false);
      void loadSoundEngine().then((engine) => engine.disableSceneAudio());
      return;
    }

    pendingRef.current = true;
    void loadSoundEngine()
      .then((engine) => engine.enableSceneAudio())
      .then((started) => setPreference('immersiveSoundEnabled', started))
      .catch(() => setPreference('immersiveSoundEnabled', false))
      .finally(() => {
        pendingRef.current = false;
      });
  };

  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-bg-raised text-text-faint transition-colors hover:border-border-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        enabled && 'border-accent/25 bg-accent-faint text-accent',
        className
      )}
      aria-label={enabled ? 'Turn immersive sound off' : 'Turn immersive sound on'}
      aria-pressed={enabled}
      title={enabled ? 'Immersive sound on' : 'Immersive sound off'}
      onPointerEnter={() => void loadSoundEngine()}
      onFocus={() => void loadSoundEngine()}
      onClick={toggle}
    >
      {enabled ? (
        <Volume2 size={16} aria-hidden="true" />
      ) : (
        <VolumeX size={16} aria-hidden="true" />
      )}
    </button>
  );
}
