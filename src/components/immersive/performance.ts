export type SceneQuality = 'full' | 'balanced' | 'essential';

interface NavigatorWithCapacity extends Navigator {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
}

export function resolveSceneQuality(
  reducedMotion: boolean,
  navigatorLike?: NavigatorWithCapacity
): SceneQuality {
  if (reducedMotion) return 'essential';
  if (!navigatorLike) return 'balanced';
  if (
    navigatorLike.connection?.saveData ||
    (navigatorLike.deviceMemory !== undefined && navigatorLike.deviceMemory <= 4) ||
    navigatorLike.hardwareConcurrency <= 4
  ) {
    return 'balanced';
  }
  return 'full';
}
