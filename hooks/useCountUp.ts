import { useEffect, useRef, useState } from "react";

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
