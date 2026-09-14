"use client";

import { useCallback, useEffect, useRef } from "react";

type ChallengeBuilderAutosaveOptions<Result> = {
  enabled: boolean;
  revision: unknown;
  secondaryRevision?: unknown;
  delay?: number;
  save: () => Promise<Result>;
  onResult: (result: Result) => void;
  onError: () => void;
};

export function useChallengeBuilderAutosave<Result>({
  enabled,
  revision,
  secondaryRevision,
  delay = 1200,
  save,
  onResult,
  onError
}: ChallengeBuilderAutosaveOptions<Result>) {
  const requestVersion = useRef(0);
  const saveRef = useRef(save);
  const resultRef = useRef(onResult);
  const errorRef = useRef(onError);
  saveRef.current = save;
  resultRef.current = onResult;
  errorRef.current = onError;

  const invalidate = useCallback(() => {
    requestVersion.current += 1;
  }, []);

  useEffect(() => {
    const version = ++requestVersion.current;
    if (!enabled) return;

    const timer = window.setTimeout(() => {
      void saveRef.current().then((result) => {
        if (version === requestVersion.current) resultRef.current(result);
      }).catch(() => {
        if (version === requestVersion.current) errorRef.current();
      });
    }, delay);

    return () => {
      window.clearTimeout(timer);
      if (version === requestVersion.current) requestVersion.current += 1;
    };
  }, [delay, enabled, revision, secondaryRevision]);

  return invalidate;
}
