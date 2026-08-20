let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let lastInteractionAt = 0;
let suspendTimer = 0;

interface AudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function ensureGraph() {
  if (audioContext && masterGain) return { context: audioContext, master: masterGain };

  const AudioContextConstructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  const context = new AudioContextConstructor({ latencyHint: 'interactive' });
  const master = context.createGain();
  master.gain.value = 0.038;
  master.connect(context.destination);
  audioContext = context;
  masterGain = master;
  return { context, master };
}

function tone(frequency: number, delay: number, duration: number, volume: number) {
  const graph = audioContext && masterGain ? { context: audioContext, master: masterGain } : null;
  if (!graph || graph.context.state !== 'running') return;

  const start = graph.context.currentTime + delay;
  const oscillator = graph.context.createOscillator();
  const gain = graph.context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(graph.master);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export async function enableSceneAudio() {
  window.clearTimeout(suspendTimer);
  suspendTimer = 0;
  const graph = ensureGraph();
  if (!graph) return false;

  if (graph.context.state === 'suspended') await graph.context.resume();
  if (graph.context.state !== 'running') return false;

  graph.master.gain.cancelScheduledValues(graph.context.currentTime);
  graph.master.gain.setTargetAtTime(0.038, graph.context.currentTime, 0.018);
  tone(246.94, 0, 0.1, 0.7);
  tone(369.99, 0.045, 0.13, 0.46);
  return true;
}

export function disableSceneAudio() {
  if (!audioContext || !masterGain) return;
  window.clearTimeout(suspendTimer);
  const now = audioContext.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setTargetAtTime(0.0001, now, 0.012);
  suspendTimer = window.setTimeout(() => {
    if (audioContext?.state === 'running') void audioContext.suspend();
    suspendTimer = 0;
  }, 90);
}

export function playInteractionCue(verticalPosition = 0.5) {
  const now = performance.now();
  if (now - lastInteractionAt < 72) return;
  lastInteractionAt = now;

  const graph = ensureGraph();
  if (!graph) return;
  const play = () => {
    const boundedPosition = Math.max(0, Math.min(verticalPosition, 1));
    tone(315 + (1 - boundedPosition) * 95, 0, 0.065, 0.32);
  };

  if (graph.context.state === 'suspended') {
    void graph.context
      .resume()
      .then(play)
      .catch(() => undefined);
  } else if (graph.context.state === 'running') {
    play();
  }
}

export function playRouteCue(order: number) {
  if (!audioContext || audioContext.state !== 'running') return;
  const root = 196 + (order % 5) * 16.5;
  tone(root, 0, 0.11, 0.28);
  tone(root * 1.5, 0.055, 0.14, 0.24);
}
