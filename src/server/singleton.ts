const registry = globalThis as typeof globalThis & { __taptogoSingletons?: Map<string, unknown> };

/**
 * One instance per server process. Module-level variables are not enough:
 * Next.js may load a module separately for pages, route handlers and server
 * actions (and re-evaluate it on hot reload), which would split in-memory state.
 */
export function processSingleton<T>(key: string, create: () => T): T {
  registry.__taptogoSingletons ??= new Map();
  if (!registry.__taptogoSingletons.has(key)) {
    registry.__taptogoSingletons.set(key, create());
  }
  return registry.__taptogoSingletons.get(key) as T;
}

/** Drops a singleton so the next access recreates it (tests, dev reset). */
export function resetProcessSingleton(key: string): void {
  registry.__taptogoSingletons?.delete(key);
}
