"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let timestamp = 0;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let initialTimer: ReturnType<typeof setTimeout> | undefined;

function publishTimestamp() {
  timestamp = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    initialTimer = setTimeout(publishTimestamp, 0);
    refreshTimer = setInterval(publishTimestamp, 60_000);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (initialTimer) clearTimeout(initialTimer);
      if (refreshTimer) clearInterval(refreshTimer);
      initialTimer = undefined;
      refreshTimer = undefined;
    }
  };
}

function getSnapshot() {
  return timestamp;
}

function getServerSnapshot() {
  return 0;
}

export function useClockTimestamp() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
