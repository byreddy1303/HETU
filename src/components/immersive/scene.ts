export type SceneWorld =
  | 'observatory'
  | 'priority'
  | 'archive'
  | 'focus'
  | 'orbit'
  | 'cartography'
  | 'ledger'
  | 'connection'
  | 'calibration';

export interface SceneNode {
  code: string;
  label: string;
  position: 'north-west' | 'north-east' | 'mid-left' | 'mid-right' | 'south-left' | 'south-right';
  depth: 1 | 2 | 3;
}

export interface ImmersiveSceneConfig {
  world: SceneWorld;
  eyebrow: string;
  title: string;
  index: string;
  nodes: SceneNode[];
}

const WORLDS: Record<SceneWorld, Omit<ImmersiveSceneConfig, 'world'>> = {
  observatory: {
    eyebrow: 'LIVE EVIDENCE WORLD',
    title: 'Readiness observatory',
    index: '00 / HOME',
    nodes: [
      { code: 'R', label: 'clean recall', position: 'north-east', depth: 2 },
      { code: 'RBS', label: 'slow route', position: 'mid-left', depth: 1 },
      { code: 'W-C', label: 'concept gap', position: 'mid-right', depth: 3 },
      { code: 'D10', label: 'next proof', position: 'south-left', depth: 2 },
      { code: 'AIR', label: 'target band', position: 'south-right', depth: 1 }
    ]
  },
  priority: {
    eyebrow: 'PRIORITY FIELD',
    title: 'The next useful action',
    index: '01 / DO NOW',
    nodes: [
      { code: '01', label: 'due recall', position: 'north-east', depth: 3 },
      { code: '02', label: 'unfinished', position: 'mid-left', depth: 1 },
      { code: '03', label: 'planned block', position: 'mid-right', depth: 2 },
      { code: '→', label: 'ordered queue', position: 'south-left', depth: 2 }
    ]
  },
  archive: {
    eyebrow: 'QUESTION ARCHIVE',
    title: 'Past papers in motion',
    index: '02 / PRACTICE',
    nodes: [
      { code: 'PYQ', label: 'question bank', position: 'north-east', depth: 2 },
      { code: 'TAG', label: 'evidence marks', position: 'mid-left', depth: 3 },
      { code: 'ANS', label: 'answer trace', position: 'mid-right', depth: 1 },
      { code: 'YR', label: 'paper timeline', position: 'south-right', depth: 2 }
    ]
  },
  focus: {
    eyebrow: 'FOCUS CHAMBER',
    title: 'One question at a time',
    index: '03 / SESSION',
    nodes: [
      { code: 'Q', label: 'active prompt', position: 'north-east', depth: 1 },
      { code: 'T+', label: 'elapsed time', position: 'mid-left', depth: 3 },
      { code: 'TAG', label: 'capture evidence', position: 'mid-right', depth: 2 },
      { code: 'END', label: 'review gate', position: 'south-left', depth: 1 }
    ]
  },
  orbit: {
    eyebrow: 'RECALL ORBIT',
    title: 'Return until it holds',
    index: '04 / RE-ATTEMPT',
    nodes: [
      { code: 'D1', label: 'first return', position: 'north-east', depth: 2 },
      { code: 'D3', label: 'spacing', position: 'mid-right', depth: 3 },
      { code: 'D10', label: 'proof point', position: 'south-right', depth: 1 },
      { code: 'M', label: 'mastered', position: 'south-left', depth: 2 }
    ]
  },
  cartography: {
    eyebrow: 'STUDY CARTOGRAPHY',
    title: 'Territory, time, direction',
    index: '05 / PLAN',
    nodes: [
      { code: 'TOC', label: 'subject territory', position: 'north-east', depth: 2 },
      { code: 'WK', label: 'weekly constraint', position: 'mid-left', depth: 1 },
      { code: 'CAL', label: 'study blocks', position: 'mid-right', depth: 3 },
      { code: 'OK', label: 'coverage', position: 'south-right', depth: 2 }
    ]
  },
  ledger: {
    eyebrow: 'EVIDENCE LEDGER',
    title: 'A record that teaches back',
    index: '06 / LIBRARY',
    nodes: [
      { code: 'WHY', label: 'root cause', position: 'north-east', depth: 2 },
      { code: 'FX', label: 'formula memory', position: 'mid-left', depth: 1 },
      { code: 'NOTE', label: 'learned signal', position: 'mid-right', depth: 3 },
      { code: 'REV', label: 'revision proof', position: 'south-left', depth: 2 }
    ]
  },
  connection: {
    eyebrow: 'SHARED SIGNAL',
    title: 'Focused study, together',
    index: '07 / BUDDY',
    nodes: [
      { code: 'LIVE', label: 'presence', position: 'north-east', depth: 3 },
      { code: 'SYNC', label: 'shared focus', position: 'mid-left', depth: 1 },
      { code: 'MSG', label: 'study signal', position: 'mid-right', depth: 2 },
      { code: '2×', label: 'accountability', position: 'south-right', depth: 1 }
    ]
  },
  calibration: {
    eyebrow: 'MEASUREMENT FIELD',
    title: 'Turn confidence into signal',
    index: '08 / ANALYSIS',
    nodes: [
      { code: 'Δ', label: 'movement', position: 'north-east', depth: 2 },
      { code: 'CAL', label: 'confidence gap', position: 'mid-left', depth: 3 },
      { code: 'AIR', label: 'readiness band', position: 'mid-right', depth: 1 },
      { code: '7D', label: 'surface trend', position: 'south-left', depth: 2 }
    ]
  }
};

function config(world: SceneWorld): ImmersiveSceneConfig {
  return { world, ...WORLDS[world] };
}

export function sceneForPath(pathname: string): ImmersiveSceneConfig {
  if (pathname === '/') return config('observatory');
  if (pathname.startsWith('/today') || pathname.startsWith('/capture')) return config('priority');
  if (pathname.startsWith('/session/')) return config('focus');
  if (pathname.startsWith('/reattempts')) return config('orbit');
  if (pathname.startsWith('/pyq') || pathname.startsWith('/mocks')) return config('archive');
  if (pathname.startsWith('/planner') || pathname.startsWith('/syllabus')) {
    return config('cartography');
  }
  if (pathname.startsWith('/buddy')) return config('connection');
  if (
    pathname.startsWith('/patterns') ||
    pathname.startsWith('/weekly-review') ||
    pathname.startsWith('/heatmap') ||
    pathname.startsWith('/calibration') ||
    pathname.startsWith('/readiness')
  ) {
    return config('calibration');
  }
  return config('ledger');
}
