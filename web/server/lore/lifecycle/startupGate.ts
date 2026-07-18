const DEFAULT_TTL_MS = 6 * 60 * 60 * 1_000;

export interface LifecycleStartupGate {
  firstSeen(clientType: string, sessionId: string, now?: number): boolean;
  clear(): void;
}

export function createLifecycleStartupGate(ttlMs = DEFAULT_TTL_MS): LifecycleStartupGate {
  const entries = new Map<string, number>();

  return {
    firstSeen(clientType: string, sessionId: string, now = Date.now()): boolean {
      const client = clientType.trim().toLowerCase();
      const session = sessionId.trim();
      if (!client || !session) return true;

      for (const [key, expiresAt] of entries) {
        if (expiresAt <= now) entries.delete(key);
      }

      const key = `${client}\u0000${session}`;
      const expiresAt = entries.get(key);
      if (expiresAt !== undefined && expiresAt > now) return false;
      entries.set(key, now + ttlMs);
      return true;
    },
    clear(): void {
      entries.clear();
    },
  };
}

export const lifecycleStartupGate = createLifecycleStartupGate();
