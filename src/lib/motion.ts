/** HETU's shared motion language: quick controls, calm content, deliberate evidence. */
export const MOTION_EASE = [0.22, 1, 0.36, 1] as const;

export const MOTION_DURATION = {
  immediate: 0.01,
  press: 0.1,
  control: 0.18,
  content: 0.24,
  page: 0.26,
  arrival: 0.52,
  evidence: 0.4,
  evidenceHold: 0.68
} as const;

export const MOTION_SPRING = {
  control: { type: 'spring', stiffness: 520, damping: 42 } as const,
  layout: { type: 'spring', stiffness: 460, damping: 38, mass: 0.72 } as const
};
