"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
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

const dashboardSources = new Set(["books", "assignments", "returns", "leftovers", "receipts", "people", "users", "masters", "edition-summary", "flags", "receipt-review"]);

class PageDataCache {
  private values = new Map<string, unknown>();
  private valueListeners = new Map<string, Set<() => void>>();
  private queries = new Map<string, QueryEntry>();

  read<T>(key: string, initial: T): T {
    return this.values.has(key) ? this.values.get(key) as T : initial;
  }

  write<T>(key: string, value: T) {
    this.values.set(key, value);
    this.valueListeners.get(key)?.forEach((notify) => notify());
  }

  subscribeValue(key: string, notify: () => void) {
    const listeners = this.valueListeners.get(key) ?? new Set<() => void>();
    this.valueListeners.set(key, listeners);
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
      if (!listeners.size) this.valueListeners.delete(key);
    };
  }

  setQueryData<T>(key: string, data: T) {
    const entry = this.entry(key);
    entry.generation += 1;
    entry.state = { data, loading: false, stale: false, error: null };
    entry.listeners.forEach((notify) => notify());
  }

  entry(key: string, initialData?: unknown): QueryEntry {
    let entry = this.queries.get(key);
    if (!entry) {
      entry = { state: { data: undefined, loading: false, stale: true, error: null },
        generation: 0, listeners: new Set() };
      this.queries.set(key, entry);
    }
    if (initialData !== undefined && entry.state.data === undefined && !entry.state.loading && !entry.pending) {
      entry.state = { data: initialData, loading: false, stale: false, error: null };
    }
    return entry;
  }

  updateQueries<T>(prefix: string, update: (previous: T) => T) {
    for (const [key, entry] of this.queries) {
      if (key.startsWith(prefix) && entry.state.data !== undefined) this.setQueryData(key, update(entry.state.data as T));
    }
  }

  invalidate(prefix: string) {
    const [accountId = "", module = ""] = prefix.split(":");
    const dashboardPrefix = accountId && module && dashboardSources.has(module) ? `${accountId}:dashboard:query:` : null;
    const reportsPrefix = accountId && module && dashboardSources.has(module) ? `${accountId}:reports:query:` : null;
    const headerPrefix = accountId && dashboardSources.has(module) ? `${accountId}:header:` : null;
    const reportOptionsPrefix = accountId && ["masters", "books", "edition-summary"].includes(module)
      ? `${accountId}:reports:options` : null;
    const reviewsPrefix = accountId && ["people", "receipts", "returns", "flags"].includes(module)
      ? `${accountId}:receipt-review:` : null;
    const donationsPrefix = accountId && ["receipts", "returns", "assignments", "books", "people", "masters", "receipt-review", "flags", "edition-summary"].includes(module)
      ? `${accountId}:donations:query:` : null;
    const donationDetailPrefix = accountId && ["receipts", "returns", "people", "receipt-review", "flags", "masters"].includes(module)
      ? `${accountId}:donations:detail:` : null;
    const donationOptionsPrefix = accountId && ["masters", "books", "edition-summary"].includes(module)
      ? `${accountId}:donations:options` : null;
    const certificatePrefix = accountId && module && ["assignments", "returns", "leftovers", "receipts", "people"].includes(module)
      ? `${accountId}:assignments:fundraiser-certificate:` : null;
    for (const [key, entry] of this.queries) {
      if (!key.startsWith(prefix) && !(dashboardPrefix && key.startsWith(dashboardPrefix))
        && !(certificatePrefix && key.startsWith(certificatePrefix))
        && !(reportsPrefix && key.startsWith(reportsPrefix))
        && !(headerPrefix && key.startsWith(headerPrefix))
        && !(reportOptionsPrefix && key.startsWith(reportOptionsPrefix))
        && !(reviewsPrefix && key.startsWith(reviewsPrefix))
        && !(donationsPrefix && key.startsWith(donationsPrefix))
        && !(donationDetailPrefix && key.startsWith(donationDetailPrefix))
        && !(donationOptionsPrefix && key.startsWith(donationOptionsPrefix))) continue;
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
  const initialRef = useRef(initial);
  initialRef.current = initial;
  useEffect(() => {
    const sync = () => setValue(cache.read(key, initialRef.current));
    sync();
    return cache.subscribeValue(key, sync);
  }, [cache, key]);
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
  initialData?: T;
  reconcile?: (previous: T | undefined, next: T) => T;
} = {}) {
  const cache = usePageDataCache();
  const { enabled = true, delay = 0, reconcile, initialData } = options;
  const subscribe = useCallback((notify: () => void) => {
    const entry = cache.entry(key, initialData);
    entry.listeners.add(notify);
    return () => { entry.listeners.delete(notify); };
  }, [cache, key, initialData]);
  const snapshot = useCallback(() => cache.entry(key, initialData).state as QueryState<T>, [cache, key, initialData]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (!enabled || !state.stale || state.loading) return;
    const timer = window.setTimeout(() => { void cache.load(key, fetchData, reconcile); }, delay);
    // Started requests finish into the shared cache even when their screen unmounts.
    return () => window.clearTimeout(timer);
  }, [cache, key, fetchData, enabled, delay, reconcile, state.stale, state.loading]);
  return state;
}
