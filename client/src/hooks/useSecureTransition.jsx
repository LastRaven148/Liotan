import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_MINIMUM_MS = 480;

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export default function useSecureTransition() {
  const mounted = useRef(true);
  const sequence = useRef(1);
  const startedAt = useRef(now());
  const minimumMs = useRef(DEFAULT_MINIMUM_MS);
  const [transition, setTransition] = useState({
    active: true,
    stage: "site-loading",
    sequence: 1
  });

  useEffect(() => () => { mounted.current = false; }, []);

  const beginSecureTransition = useCallback((stage, options = {}) => {
    sequence.current += 1;
    startedAt.current = now();
    minimumMs.current = Math.max(0, Number(options.minimumMs ?? DEFAULT_MINIMUM_MS));
    const next = { active: true, stage, sequence: sequence.current };
    if (mounted.current) setTransition(next);
    return next.sequence;
  }, []);

  const updateSecureTransition = useCallback(stage => {
    if (mounted.current) {
      setTransition(current => current.active ? { ...current, stage } : current);
    }
  }, []);

  const completeSecureTransition = useCallback(async options => {
    const expectedSequence = sequence.current;
    const desiredMinimum = Math.max(0, Number(options?.minimumMs ?? minimumMs.current));
    const remaining = Math.max(0, desiredMinimum - (now() - startedAt.current));
    if (remaining) await new Promise(resolve => window.setTimeout(resolve, remaining));
    if (mounted.current && sequence.current === expectedSequence) {
      setTransition(current => ({ ...current, active: false }));
    }
  }, []);

  return {
    secureTransition: transition,
    beginSecureTransition,
    updateSecureTransition,
    completeSecureTransition
  };
}
