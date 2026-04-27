"use client"

type PersistMode = "memory" | "session" | "local"

type CacheEntry<T> = {
    expiresAt: number
    value: T
}

const CACHE_PREFIX = "qc_cache_v1:"
const MAX_PERSIST_BYTES = 250_000

const memoryCache = new Map<string, CacheEntry<unknown>>()
const inFlight = new Map<string, Promise<unknown>>()

function getUserNamespace(): string {
    try {
        const raw = localStorage.getItem("qc_user")
        if (!raw) return "anon"
        const user = JSON.parse(raw) as { id?: number; role?: string }
        if (typeof user?.id !== "number") return "anon"
        const role = typeof user?.role === "string" ? user.role : ""
        return `u${user.id}${role ? `:${role}` : ""}`
    } catch {
        return "anon"
    }
}

function getStorage(persist: PersistMode): Storage | null {
    if (persist === "local") return localStorage
    if (persist === "session") return sessionStorage
    return null
}

function b64Encode(input: string): string {
    return btoa(unescape(encodeURIComponent(input)))
}

function makeScopedKey(key: string, persist: PersistMode, namespace: string): string {
    return `${persist}:${namespace}:${key}`
}

function makeStorageKey(key: string, namespace: string): string {
    return `${CACHE_PREFIX}${namespace}:${b64Encode(key)}`
}

function readPersisted<T>(key: string, persist: PersistMode, namespace: string): CacheEntry<T> | null {
    const storage = getStorage(persist)
    if (!storage) return null

    const storageKey = makeStorageKey(key, namespace)
    const raw = storage.getItem(storageKey)
    if (!raw) return null

    try {
        const parsed = JSON.parse(raw) as CacheEntry<T>
        if (!parsed || typeof parsed.expiresAt !== "number") {
            storage.removeItem(storageKey)
            return null
        }
        if (Date.now() > parsed.expiresAt) {
            storage.removeItem(storageKey)
            return null
        }
        return parsed
    } catch {
        storage.removeItem(storageKey)
        return null
    }
}

function writePersisted<T>(key: string, entry: CacheEntry<T>, persist: PersistMode, namespace: string) {
    const storage = getStorage(persist)
    if (!storage) return

    try {
        const payload = JSON.stringify(entry)
        if (payload.length > MAX_PERSIST_BYTES) return
        storage.setItem(makeStorageKey(key, namespace), payload)
    } catch {
        // Ignore storage write failures (quota, privacy mode).
    }
}

export function clearClientCache() {
    memoryCache.clear()
    inFlight.clear()
    const prefixes = [CACHE_PREFIX]

    for (const storage of [sessionStorage, localStorage]) {
        try {
            const toDelete: string[] = []
            for (let i = 0; i < storage.length; i++) {
                const k = storage.key(i)
                if (!k) continue
                if (prefixes.some((p) => k.startsWith(p))) toDelete.push(k)
            }
            toDelete.forEach((k) => storage.removeItem(k))
        } catch {
            // Ignore.
        }
    }
}

export async function cachedJson<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: { ttlMs: number; persist?: PersistMode; namespace?: "user" | "public" | string; bust?: boolean }
): Promise<T> {
    const persist = options.persist ?? "session"
    const namespace =
        options.namespace === "public"
            ? "public"
            : typeof options.namespace === "string" && options.namespace !== "user"
                ? options.namespace
                : getUserNamespace()
    const scopedKey = makeScopedKey(key, persist, namespace)

    if (!options.bust) {
        const mem = memoryCache.get(scopedKey) as CacheEntry<T> | undefined
        if (mem && Date.now() <= mem.expiresAt) return mem.value
        if (mem) memoryCache.delete(scopedKey)

        const persisted = readPersisted<T>(key, persist, namespace)
        if (persisted) {
            memoryCache.set(scopedKey, persisted as CacheEntry<unknown>)
            return persisted.value
        }
    }

    const existing = inFlight.get(scopedKey) as Promise<T> | undefined
    if (existing) return existing

    const p = (async () => {
        const value = await fetcher()
        const entry: CacheEntry<T> = { value, expiresAt: Date.now() + options.ttlMs }
        memoryCache.set(scopedKey, entry as CacheEntry<unknown>)
        writePersisted(key, entry, persist, namespace)
        return value
    })()

    inFlight.set(scopedKey, p as Promise<unknown>)
    try {
        return await p
    } finally {
        inFlight.delete(scopedKey)
    }
}
