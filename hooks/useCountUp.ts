import { useCallback, useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/hooks/useReducedMotion";

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Shared rAF driver: on every `replayKey` change (and on mount) runs an
 * ease-out-cubic progress 0 → 1 over `duration` ms, then stays at 1.
 * Returns the eased progress and whether an animation is currently running.
 */
function useEaseDriver(replayKey: number, duration: number) {
  const reducedMotion = useReducedMotion();
  const [progress, setProgress] = useState(1);
  const animatingRef = useRef(false);

  useEffect(() => {
    if (reducedMotion) {
      animatingRef.current = false;
      setProgress(1);
      return;
    }
    animatingRef.current = true;
    setProgress(0);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setProgress(easeOutCubic(t));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        animatingRef.current = false;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      animatingRef.current = false;
      cancelAnimationFrame(raf);
    };
  }, [replayKey, duration, reducedMotion]);

  return { progress, animatingRef, reducedMotion };
}

/**
 * Counts from 0 up to `target` (ease-out cubic) each time `replayKey` changes.
 * While idle, snaps to the latest real `target` without re-animating.
 * Respects prefers-reduced-motion by returning `target` instantly.
 */
export function useCountUp(
  target: number,
  replayKey: number,
  duration = 1200,
): number {
  const { progress, animatingRef, reducedMotion } = useEaseDriver(
    replayKey,
    duration,
  );
  const targetRef = useRef(target);
  targetRef.current = target;
  const [value, setValue] = useState(target);

  useEffect(() => {
    if (reducedMotion) {
      setValue(target);
      return;
    }
    setValue(Math.round(targetRef.current * progress));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, reducedMotion]);

  // After the animation completes, keep rendering the freshest real value.
  useEffect(() => {
    if (!animatingRef.current) setValue(target);
  }, [target, animatingRef]);

  return value;
}

/**
 * Ease-out-cubic progress 0 → 1 replayed whenever `replayKey` changes.
 * Respects prefers-reduced-motion by returning 1 instantly.
 */
export function useEaseOutProgress(replayKey: number, duration = 1000): number {
  const { progress } = useEaseDriver(replayKey, duration);
  return progress;
}

/**
 * Bottom-to-top grow animation for a group of bars (e.g. a bar chart).
 *
 * Returns a `progress(index)` getter: 0 → 1 per bar with ease-out-cubic
 * easing and a slight left-to-right stagger. The animation starts whenever
 * `active` turns true (or `replayKey` changes while active) and resets to 0
 * whenever `active` turns false, so re-entry always starts clean.
 *
 * Respects prefers-reduced-motion by always reporting full progress.
 */
export function useBarGrowProgress(
  active: boolean,
  replayKey: number,
  count: number,
  duration = 800,
  stagger = 50,
): (index: number) => number {
  const reducedMotion = useReducedMotion();
  // -1 = idle at 0 (inactive / pre-animation).
  const [elapsed, setElapsed] = useState(-1);

  useEffect(() => {
    if (reducedMotion) return;
    if (!active) {
      setElapsed(-1);
      return;
    }
    setElapsed(0);
    const start = performance.now();
    const total = duration + stagger * Math.max(0, count - 1);
    let raf = 0;
    const tick = (now: number) => {
      const e = now - start;
      setElapsed(e);
      if (e < total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, replayKey, count, duration, stagger, reducedMotion]);

  return useCallback(
    (index: number) => {
      if (reducedMotion) return 1;
      if (elapsed < 0) return 0;
      const t = Math.min(1, Math.max(0, (elapsed - index * stagger) / duration));
      return easeOutCubic(t);
    },
    [reducedMotion, elapsed, stagger, duration],
  );
}
