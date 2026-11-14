// lib/data-version.ts
// Global counter bumped after every successful write request (see
// service/axiosIntance.ts). Client listings add it to their fetch effect
// dependencies so they reload after a create / update / delete, which
// router.refresh() no longer does now that they fetch in the browser.
import { useSyncExternalStore } from 'react';

let version = 0;
const listeners = new Set<() => void>();

export const bumpDataVersion = () => {
  version += 1;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useDataVersion = () =>
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0
  );
