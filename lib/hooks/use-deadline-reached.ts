"use client";

import { useSyncExternalStore } from "react";

function snapshot(deadline: number) {
  return Number.isFinite(deadline) && deadline > 0 && Date.now() >= deadline;
}

function subscribe(deadline: number, notify: () => void) {
  if (!Number.isFinite(deadline) || deadline <= Date.now()) return () => undefined;

  const timer = window.setTimeout(notify, deadline - Date.now() + 1);
  return () => window.clearTimeout(timer);
}

export function useDeadlineReached(deadline: number) {
  return useSyncExternalStore(
    (notify) => subscribe(deadline, notify),
    () => snapshot(deadline),
    () => false
  );
}
