import { useEffect, useRef } from 'react';
import type { SceneWorld } from '@/components/immersive/scene';

const FRAME_INTERVAL_MS = 1000 / 18;
const MAX_DEVICE_PIXEL_RATIO = 1.25;

const WORLD_TONES: Record<SceneWorld, readonly [number, number, number]> = {
  observatory: [152 / 255, 24 / 255, 43 / 255],
  priority: [152 / 255, 24 / 255, 43 / 255],
  archive: [69 / 255, 94 / 255, 139 / 255],
  focus: [54 / 255, 112 / 255, 105 / 255],
  orbit: [105 / 255, 78 / 255, 118 / 255],
  cartography: [145 / 255, 101 / 255, 32 / 255],
  ledger: [103 / 255, 87 / 255, 93 / 255],
  connection: [152 / 255, 24 / 255, 43 / 255],
  calibration: [54 / 255, 112 / 255, 105 / 255]
};

const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_uv;

  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;

  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec3 u_tone;

  float signalLine(vec2 point, float offset, float frequency, float phase) {
    float wave = sin(point.x * frequency + phase) * 0.075;
    wave += sin(point.x * (frequency * 0.47) - phase * 0.62) * 0.035;
    float distanceToLine = abs(point.y - offset - wave);
    return smoothstep(0.075, 0.0, distanceToLine);
  }

  void main() {
    vec2 point = v_uv * 2.0 - 1.0;
    point.x *= u_resolution.x / max(u_resolution.y, 1.0);

    float first = signalLine(point, 0.18, 2.7, u_time * 0.11);
    float second = signalLine(point, -0.32, 3.6, -u_time * 0.075);
    float crossing = first * second;
    float vignette = smoothstep(1.42, 0.22, length(point * vec2(0.58, 0.88)));
    float alpha = (first * 0.018 + second * 0.012 + crossing * 0.045) * vignette;

    gl_FragColor = vec4(u_tone, alpha);
  }
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export default function WebGLAtmosphere({ world }: { world: SceneWorld }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toneRef = useRef(WORLD_TONES[world]);

  useEffect(() => {
    toneRef.current = WORLD_TONES[world];
  }, [world]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: 'low-power',
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      stencil: false
    });
    if (!gl) return;

    const program = createProgram(gl);
    if (!program) return;

    const position = gl.getAttribLocation(program, 'a_position');
    const time = gl.getUniformLocation(program, 'u_time');
    const resolution = gl.getUniformLocation(program, 'u_resolution');
    const tone = gl.getUniformLocation(program, 'u_tone');
    const buffer = gl.createBuffer();
    if (!buffer || position < 0 || !time || !resolution || !tone) {
      gl.deleteProgram(program);
      if (buffer) gl.deleteBuffer(buffer);
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.useProgram(program);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let frame = 0;
    let previousFrame = 0;
    let running = !document.hidden;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    };

    const draw = (timestamp: number) => {
      if (!running) return;
      frame = window.requestAnimationFrame(draw);
      if (timestamp - previousFrame < FRAME_INTERVAL_MS) return;
      previousFrame = timestamp;
      const [red, green, blue] = toneRef.current;
      gl.uniform1f(time, timestamp / 1000);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform3f(tone, red, green, blue);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const onVisibilityChange = () => {
      running = !document.hidden;
      if (running && !frame) frame = window.requestAnimationFrame(draw);
      if (!running && frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
      running = false;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    };

    canvas.addEventListener('webglcontextlost', onContextLost);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('resize', resize, { passive: true });
    resize();
    frame = window.requestAnimationFrame(draw);

    return () => {
      running = false;
      canvas.removeEventListener('webglcontextlost', onContextLost);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', resize);
      if (frame) window.cancelAnimationFrame(frame);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return <canvas ref={canvasRef} className="immersive-atmosphere" />;
}
