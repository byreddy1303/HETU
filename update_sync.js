const fs = require('fs');
const file = 'src/lib/sync.ts';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('export function awaitInitialPull')) {
  // Add listeners for pull active state
  code = code.replace('let initialPullForUserId: string | null = null;', 
`let initialPullForUserId: string | null = null;
const initialPullListeners = new Set<() => void>();

function notifyInitialPullChange() {
  initialPullListeners.forEach((l) => l());
}

export function subscribeInitialPull(listener: () => void) {
  initialPullListeners.add(listener);
  return () => initialPullListeners.delete(listener);
}

export function isInitialPullActive() {
  return initialPullBarrier !== null;
}

export function awaitInitialPull(userId: string): Promise<void> {
  if (initialPullForUserId === userId && initialPullBarrier) {
    return initialPullBarrier;
  }
  return Promise.resolve();
}`);
  
  // Need to call notifyInitialPullChange when initialPullBarrier changes
  code = code.replace(/initialPullBarrier = barrier;/g, 'initialPullBarrier = barrier; notifyInitialPullChange();');
  code = code.replace(/initialPullBarrier = null;/g, 'initialPullBarrier = null; notifyInitialPullChange();');
  
  fs.writeFileSync(file, code);
  console.log('Updated sync.ts');
} else {
  console.log('sync.ts already updated');
}
