"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import type { Dispatch, ReactNode, SetStateAction } from "react";

interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  stale: boolean;
  error: unknown;
}
interface QueryEntry {
  state: QueryState<unknown>;
  generation: number;
  listeners: Set<() => void>;
  pending?: { generation: number; promise: Promise<void> };
}

class PageDataCache {
  private values = new Map<string, unknown>();
  private queries = new Map<string, QueryEntry>();

  read<T>(key: string, initial: T): T {
    return this.values.has(key) ? this.values.get(key) as T : initial;
  }

  write<T>(key: string, value: T) { this.values.set(key, value); }

  setQueryData<T>(key: string, data: T) {
    const entry = this.entry(key);
    entry.generation += 1;
    entry.state = { data, loading: false, stale: false, error: null };
    entry.listeners.forEach((notify) => notify());
  }

  entry(key: string): QueryEntry {
    let entry = this.queries.get(key);
    if (!entry) {
      entry = { state: { data: undefined, loading: false, stale: true, error: null },
        generation: 0, listeners: new Set() };
      this.queries.set(key, entry);
    }
    return entry;
  }

  updateQueries<T>(prefix: string, update: (previous: T) => T) {
    for (const [key, entry] of this.queries) {
      if (key.startsWith(prefix) && entry.state.data !== undefined) this.setQueryData(key, update(entry.state.data as T));
    }
  }

  invalidate(prefix: string) {
    for (const [key, entry] of this.queries) {
      if (!key.startsWith(prefix)) continue;
      entry.generation += 1;
      entry.state = { ...entry.state, stale: true, loading: false, error: null };
      entry.listeners.forEach((notify) => notify());
    }
  }

  load<T>(key: string, fetchData: () => Promise<T>, reconcile?: (previous: T | undefined, next: T) => T) {
    const entry = this.entry(key);
    if (entry.pending?.generation === entry.generation) return entry.pending.promise;
    const generation = entry.generation;
    entry.state = { ...entry.state, loading: true, error: null };
    entry.listeners.forEach((notify) => notify());
    const promise = Promise.resolve().then(fetchData).then((next) => {
      if (entry.generation !== generation) return;
      const previous = entry.state.data as T | undefined;
      entry.state = { data: reconcile ? reconcile(previous, next) : next,
        loading: false, stale: false, error: null };
    }, (error: unknown) => {
      if (entry.generation !== generation) return;
      entry.state = { ...entry.state, loading: false, stale: false, error };
    }).finally(() => {
      if (entry.pending?.generation === generation) entry.pending = undefined;
      if (entry.generation === generation) entry.listeners.forEach((notify) => notify());
    });
    entry.pending = { generation, promise };
    return promise;
  }

  clear() {
    this.values.clear();
    for (const entry of this.queries.values()) entry.generation += 1;
    this.queries.clear();
  }
}

const PageDataContext = createContext<PageDataCache | null>(null);

export function PageDataProvider({ children }: { children: ReactNode }) {
  const [cache] = useState(() => new PageDataCache());
  const pathname = usePathname();
  useEffect(() => {
    if (/^\/(login|signup|forgot-password|reset-password|verify-email|activate-account)(\/|$)/.test(pathname)) {
      cache.clear();
    }
  }, [cache, pathname]);
  return <PageDataContext.Provider value={cache}>{children}</PageDataContext.Provider>;
}

export function usePageDataCache() {
  const cache = useContext(PageDataContext);
  if (!cache) throw new Error("PageDataProvider is required");
  return cache;
}

// Keep view selections in memory; do not store form drafts, credentials, or OTPs here.
export function usePageState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const cache = usePageDataCache();
  const [value, setValue] = useState(() => cache.read(key, initial));
  const update = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    const current = cache.read(key, initial);
    const result = typeof next === "function" ? (next as (value: T) => T)(current) : next;
    cache.write(key, result);
    setValue(result);
  }, [cache, key, initial]);
  return [value, update];
}

export function usePageQuery<T>(key: string, fetchData: () => Promise<T>, options: {
  enabled?: boolean;
  delay?: number;
  reconcile?: (previous: T | undefined, next: T) => T;
} = {}) {
  const cache = usePageDataCache();
  const { enabled = true, delay = 0, reconcile } = options;
  const subscribe = useCallback((notify: () => void) => {
    const entry = cache.entry(key);
    entry.listeners.add(notify);
    return () => { entry.listeners.delete(notify); };
  }, [cache, key]);
  const snapshot = useCallback(() => cache.entry(key).state as QueryState<T>, [cache, key]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (!enabled || !state.stale || state.loading) return;
    const timer = window.setTimeout(() => { void cache.load(key, fetchData, reconcile); }, delay);
    // Started requests finish into the shared cache even when their screen unmounts.
    return () => window.clearTimeout(timer);
  }, [cache, key, fetchData, enabled, delay, reconcile, state.stale, state.loading]);
  return state;
}
