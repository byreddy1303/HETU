import { useEffect, useRef, useState } from 'react';
import './learning-sculpture.css';

type LearningSculptureProps = {
  className?: string;
  paused?: boolean;
  phase?: number;
  compact?: boolean;
};

type Point = { x: number; y: number; z: number };
type Stroke = { points: Point[]; depth: number; light: number; cross: boolean };

const TAU = Math.PI * 2;
const FRAME_INTERVAL = 1000 / 30;

/** A decorative, dependency-free 3D study loop, projected onto a 2D canvas. */
export default function LearningSculpture({
  className = '',
  paused = false,
  phase = 0,
  compact = false
}: LearningSculptureProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ paused, phase });
  const refresh = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    settings.current = { paused, phase: Math.max(0, Math.min(2, phase)) };
    refresh.current?.();
  }, [paused, phase]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext('2d', { alpha: true });
    } catch {
      // The sculptural CSS fallback remains visible without canvas support.
    }
    if (!context) return;
    const ctx = context;
    const sculptureStyle = window.getComputedStyle(container);
    const palette = {
      hue: Number(sculptureStyle.getPropertyValue('--sculpture-hue').trim()) || 166,
      mint: sculptureStyle.getPropertyValue('--sculpture-mint').trim() || '112 255 215',
      cyan: sculptureStyle.getPropertyValue('--sculpture-cyan').trim() || '102 224 255',
      spark: sculptureStyle.getPropertyValue('--sculpture-spark').trim() || '226 255 246'
    };
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionPreference.matches;
    let visible = true;
    let disposed = false;
    let frame = 0;
    let lastTime = 0;
    let elapsed = 0;
    let width = 0;
    let height = 0;
    let currentPhase = settings.current.phase;
    let pointerX = 0;
    let pointerY = 0;
    let tiltX = 0;
    let tiltY = 0;

    const canAnimate = () =>
      !disposed && visible && !document.hidden && !reducedMotion && !settings.current.paused;

    const draw = () => {
      if (!width || !height || disposed) return;

      const size = Math.min(width * 0.305, height * 0.34);
      const centerX = width * 0.5;
      const centerY = height * 0.475;
      const angleX = -0.64 + Math.sin(elapsed * 0.13) * 0.09 + tiltY * 0.17;
      // Keep the opening legible while turning; a full Y rotation collapses
      // the loop to a thin edge for several seconds on narrow screens.
      const angleY = 0.36 + Math.sin(elapsed * 0.15) * 0.44 + tiltX * 0.25;
      const angleZ = -0.28 + elapsed * 0.045;
      const sinX = Math.sin(angleX);
      const cosX = Math.cos(angleX);
      const sinY = Math.sin(angleY);
      const cosY = Math.cos(angleY);
      const sinZ = Math.sin(angleZ);
      const cosZ = Math.cos(angleZ);
      const hue = palette.hue + currentPhase * 12;

      const project = (x: number, y: number, z: number): Point => {
        const y1 = y * cosX - z * sinX;
        const z1 = y * sinX + z * cosX;
        const x2 = x * cosY + z1 * sinY;
        const z2 = -x * sinY + z1 * cosY;
        const perspective = 4.8 / (4.8 - z2);
        return {
          x: centerX + (x2 * cosZ - y1 * sinZ) * size * perspective,
          y: centerY + (x2 * sinZ + y1 * cosZ) * size * perspective,
          z: z2
        };
      };

      const surface = (u: number, v: number) => {
        const twist = v + u * 2 + currentPhase * 0.26;
        const bend = Math.sin(u * 3 + currentPhase) * (0.045 + currentPhase * 0.018);
        const radius = 1.02 + bend;
        const tube = 0.32 + Math.sin(u * 2 - currentPhase) * 0.055;
        return project(
          (radius + tube * Math.cos(twist)) * Math.cos(u),
          (radius + tube * Math.cos(twist)) * Math.sin(u),
          tube * Math.sin(twist) + Math.sin(u * 2) * (0.13 + currentPhase * 0.025)
        );
      };

      ctx.clearRect(0, 0, width, height);

      // Quiet reference orbits establish depth without competing with the learning loop.
      ctx.lineWidth = 0.7;
      [1.69, 1.87].forEach((radius, index) => {
        ctx.beginPath();
        for (let step = 0; step <= 160; step += 1) {
          const angle = (step / 160) * TAU;
          const point = project(radius * Math.cos(angle), radius * Math.sin(angle), -0.17);
          if (step === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        }
        ctx.strokeStyle = `rgb(${palette.cyan} / ${index === 0 ? 0.25 : 0.12})`;
        ctx.stroke();
      });

      const strokes: Stroke[] = [];
      const fibers = compact ? 38 : 58;
      const sections = 16;
      const samples = compact ? 6 : 9;

      // Split each longitudinal filament into depth-sorted sections so the back
      // of the object reads through the luminous filaments on its nearer surface.
      for (let fiber = 0; fiber < fibers; fiber += 1) {
        const v = (fiber / fibers) * TAU;
        for (let section = 0; section < sections; section += 1) {
          const points: Point[] = [];
          let depth = 0;
          for (let sample = 0; sample <= samples; sample += 1) {
            const u = ((section + sample / samples) / sections) * TAU;
            const point = surface(u, v);
            points.push(point);
            depth += point.z;
          }
          strokes.push({
            points,
            depth: depth / points.length,
            light: 0.5 + Math.sin(v + (section / sections) * TAU * 2) * 0.5,
            cross: false
          });
        }
      }

      // Deliberately sparse cross-sections reveal the shape's topology.
      for (let ring = 0; ring < 16; ring += 1) {
        const points: Point[] = [];
        let depth = 0;
        for (let step = 0; step <= 48; step += 1) {
          const point = surface((ring / 16) * TAU, (step / 48) * TAU);
          points.push(point);
          depth += point.z;
        }
        strokes.push({ points, depth: depth / points.length, light: 0.5, cross: true });
      }

      strokes.sort((a, b) => a.depth - b.depth);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      strokes.forEach(({ points, depth, light, cross }) => {
        const front = Math.max(0, Math.min(1, (depth + 1.3) / 2.6));
        const alpha = cross ? 0.075 + front * 0.12 : 0.15 + front * 0.58;
        const luminance = 49 + front * 26 + light * 10;
        ctx.strokeStyle = `hsla(${hue + light * 14}, ${64 + light * 12}%, ${luminance}%, ${alpha})`;
        ctx.lineWidth = cross ? 0.55 : 0.55 + front * 0.48;
        ctx.beginPath();
        points.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();
      });

      // Three orbiting sparks echo practice, diagnosis, and recall.
      for (let index = 0; index < 3; index += 1) {
        const angle = (index / 3) * TAU + elapsed * 0.12 + 0.4;
        const point = project(1.69 * Math.cos(angle), 1.69 * Math.sin(angle), -0.17);
        const active = index === Math.round(currentPhase);
        const glow = ctx.createRadialGradient(
          point.x,
          point.y,
          0,
          point.x,
          point.y,
          active ? 18 : 9
        );
        glow.addColorStop(
          0,
          active ? `rgb(${palette.mint} / 0.72)` : `rgb(${palette.cyan} / 0.38)`
        );
        glow.addColorStop(1, `rgb(${palette.cyan} / 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(point.x, point.y, active ? 18 : 9, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgb(${active ? palette.spark : palette.cyan})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, active ? 2.4 : 1.5, 0, TAU);
        ctx.fill();
      }
    };

    const tick = (time: number) => {
      frame = 0;
      if (!canAnimate()) return;
      if (!lastTime) lastTime = time;
      const delta = time - lastTime;
      if (delta >= FRAME_INTERVAL) {
        const seconds = Math.min(delta / 1000, 0.08);
        lastTime = time - (delta % FRAME_INTERVAL);
        elapsed += seconds;
        currentPhase += (settings.current.phase - currentPhase) * 0.055;
        tiltX += (pointerX - tiltX) * 0.065;
        tiltY += (pointerY - tiltY) * 0.065;
        draw();
      }
      frame = window.requestAnimationFrame(tick);
    };

    const reconcile = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      if (reducedMotion || settings.current.paused) {
        currentPhase = settings.current.phase;
        tiltX = 0;
        tiltY = 0;
      }
      if (visible && !document.hidden) draw();
      if (canAnimate()) frame = window.requestAnimationFrame(tick);
    };

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (visible && !document.hidden) draw();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !canAnimate()) return;
      const bounds = container.getBoundingClientRect();
      pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      pointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    };
    const onPointerLeave = () => {
      pointerX = 0;
      pointerY = 0;
    };
    const onMotionChange = () => {
      reducedMotion = motionPreference.matches;
      reconcile();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        reconcile();
      },
      { threshold: 0 }
    );
    intersectionObserver.observe(container);
    container.addEventListener('pointermove', onPointerMove, { passive: true });
    container.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', reconcile);
    motionPreference.addEventListener('change', onMotionChange);
    refresh.current = reconcile;
    resize();
    setReady(true);
    reconcile();

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', reconcile);
      motionPreference.removeEventListener('change', onMotionChange);
      refresh.current = null;
    };
  }, [compact]);

  return (
    <div
      ref={containerRef}
      className={`learning-sculpture${compact ? ' learning-sculpture--compact' : ''} ${className}`}
      data-ready={ready ? 'true' : undefined}
      aria-hidden="true"
    >
      <div className="learning-sculpture__halo" />
      <div className="learning-sculpture__fallback">
        <span />
        <span />
        <span />
      </div>
      <canvas ref={canvasRef} className="learning-sculpture__canvas" aria-hidden="true" />
      <div className="learning-sculpture__ground" />
    </div>
  );
}
