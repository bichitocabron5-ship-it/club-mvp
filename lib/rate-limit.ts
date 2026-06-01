import { NextResponse } from "next/server";

type RateLimitOptions = {
  key: string;
  namespace: string;
  limit: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitResult =
  | {
      ok: true;
      limit: number;
      remaining: number;
      resetAt: number;
    }
  | {
      ok: false;
      limit: number;
      remaining: 0;
      resetAt: number;
      retryAfterSeconds: number;
    };

const globalForRateLimit = globalThis as typeof globalThis & {
  __clubRateLimitStore?: Map<string, RateLimitEntry>;
  __clubRateLimitLastCleanup?: number;
};

const store = globalForRateLimit.__clubRateLimitStore ?? new Map<string, RateLimitEntry>();
globalForRateLimit.__clubRateLimitStore = store;

function cleanupExpiredEntries(now: number) {
  const lastCleanup = globalForRateLimit.__clubRateLimitLastCleanup ?? 0;

  if (now - lastCleanup < 60_000) {
    return;
  }

  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }

  globalForRateLimit.__clubRateLimitLastCleanup = now;
}

export function getClientIp(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const forwardedIp = forwardedFor?.split(",")[0]?.trim();

  return (
    forwardedIp ||
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

export function checkRateLimit({
  key,
  namespace,
  limit,
  windowMs,
}: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  cleanupExpiredEntries(now);

  const storeKey = `${namespace}:${key}`;
  const current = store.get(storeKey);

  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(storeKey, { count: 1, resetAt });

    return {
      ok: true,
      limit,
      remaining: Math.max(limit - 1, 0),
      resetAt,
    };
  }

  if (current.count >= limit) {
    return {
      ok: false,
      limit,
      remaining: 0,
      resetAt: current.resetAt,
      retryAfterSeconds: Math.max(Math.ceil((current.resetAt - now) / 1000), 1),
    };
  }

  current.count += 1;
  store.set(storeKey, current);

  return {
    ok: true,
    limit,
    remaining: Math.max(limit - current.count, 0),
    resetAt: current.resetAt,
  };
}

export function rateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
  return NextResponse.json(
    { error: "Demasiadas solicitudes. Intentalo de nuevo mas tarde." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}
