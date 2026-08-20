import { createContext, useContext } from 'react';
import type { ImmersiveSceneConfig } from '@/components/immersive/scene';
import type { SceneQuality } from '@/components/immersive/performance';

export interface SceneContextValue {
  config: ImmersiveSceneConfig;
  quality: SceneQuality;
  reducedMotion: boolean;
}

export const SceneContext = createContext<SceneContextValue | null>(null);

export function useImmersiveScene() {
  const context = useContext(SceneContext);
  if (!context) throw new Error('useImmersiveScene must be used inside SceneProvider');
  return context;
}
