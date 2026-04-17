import { useSyncExternalStore } from "react";
import type { UserProfile } from "./api-auth";

let _profile: UserProfile | null = null;
const _listeners = new Set<() => void>();

export const userStore = {
  get: (): UserProfile | null => _profile,
  set(p: UserProfile | null) {
    _profile = p;
    _listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    _listeners.add(l);
    return () => { _listeners.delete(l); };
  },
};

export function useProfile(): UserProfile | null {
  return useSyncExternalStore(userStore.subscribe, userStore.get);
}
