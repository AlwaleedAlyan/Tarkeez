export type MomentumOptions = {
  friction?: number;
  minVelocity?: number;
  velocityCap?: number;
};

export type MomentumScroller = {
  isActive: () => boolean;
  stop: () => void;
  start: (initialVelocity: number) => void;
  inject: (extraVelocity: number) => void;
};

const DEFAULTS = {
  friction: 2.5,
  minVelocity: 30,
  velocityCap: 8000,
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

const hasRaf =
  typeof requestAnimationFrame === "function" &&
  typeof cancelAnimationFrame === "function";

const nowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

export function createMomentumScroller(
  applyDelta: (dy: number) => void,
  opts?: MomentumOptions,
): MomentumScroller {
  const friction = opts?.friction ?? DEFAULTS.friction;
  const minVelocity = opts?.minVelocity ?? DEFAULTS.minVelocity;
  const cap = opts?.velocityCap ?? DEFAULTS.velocityCap;

  let velocity = 0;
  let rafId: number | null = null;
  let lastTs = 0;

  function stop() {
    if (rafId !== null && hasRaf) {
      cancelAnimationFrame(rafId);
    }
    rafId = null;
    velocity = 0;
  }

  function step() {
    if (rafId === null) return;
    const now = nowMs();
    const dt = Math.min(0.064, Math.max(0, (now - lastTs) / 1000));
    lastTs = now;
    const dy = velocity * dt;
    if (dy !== 0) applyDelta(dy);
    velocity *= Math.exp(-friction * dt);
    if (Math.abs(velocity) < minVelocity) {
      stop();
      return;
    }
    rafId = requestAnimationFrame(step);
  }

  function ensureRunning() {
    if (!hasRaf) {
      // No animation frame available — apply remaining velocity once and stop.
      const dy = velocity * 0.016;
      if (dy !== 0) applyDelta(dy);
      velocity = 0;
      return;
    }
    if (rafId !== null) return;
    lastTs = nowMs();
    rafId = requestAnimationFrame(step);
  }

  function start(initial: number) {
    velocity = clamp(initial, -cap, cap);
    if (Math.abs(velocity) < minVelocity) {
      velocity = 0;
      return;
    }
    ensureRunning();
  }

  function inject(extra: number) {
    velocity = clamp(velocity + extra, -cap, cap);
    if (Math.abs(velocity) < minVelocity) {
      stop();
      return;
    }
    ensureRunning();
  }

  return {
    isActive: () => rafId !== null,
    stop,
    start,
    inject,
  };
}
