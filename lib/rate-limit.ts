type RateLimitOptions = {
  scope: string
  limit: number
  windowMs: number
}

type RateLimitBucket = {
  count: number
  resetAt: number
}

type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfter: number
}

const globalStore = globalThis as typeof globalThis & {
  __cryptodebateRateLimits?: Map<string, RateLimitBucket>
}

const buckets =
  globalStore.__cryptodebateRateLimits ??
  (globalStore.__cryptodebateRateLimits = new Map<string, RateLimitBucket>())

function clientFingerprint(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")
  const realIp = request.headers.get("x-real-ip")
  const ip =
    forwardedFor
      ?.split(",")
      .map((item) => item.trim())
      .find(Boolean) ??
    realIp ??
    "unknown"
  const userAgent = request.headers.get("user-agent") ?? "unknown"

  return `${ip}:${userAgent.slice(0, 80)}`
}

function cleanupExpired(now: number) {
  if (buckets.size < 5000) {
    return
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

export function checkRateLimit(
  request: Request,
  options: RateLimitOptions,
): RateLimitResult {
  const now = Date.now()
  const key = `${options.scope}:${clientFingerprint(request)}`
  const existing = buckets.get(key)
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : {
          count: 0,
          resetAt: now + options.windowMs,
        }

  bucket.count += 1
  buckets.set(key, bucket)
  cleanupExpired(now)

  const remaining = Math.max(options.limit - bucket.count, 0)
  const retryAfter = Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1)

  return {
    allowed: bucket.count <= options.limit,
    limit: options.limit,
    remaining,
    resetAt: bucket.resetAt,
    retryAfter,
  }
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "retry-after": String(result.retryAfter),
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(result.remaining),
    "x-ratelimit-reset": String(Math.ceil(result.resetAt / 1000)),
  }
}
