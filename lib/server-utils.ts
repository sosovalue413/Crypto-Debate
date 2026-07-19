import { createHash } from "crypto"

export function compactNumber(value: unknown, currency = false) {
  const num = Number(value)

  if (!Number.isFinite(num)) {
    return "n/a"
  }

  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(num) >= 100000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(num) >= 1000 ? 1 : 2,
    style: currency ? "currency" : "decimal",
    currency: "USD",
  }).format(num)
}

export function percent(value: unknown) {
  const num = Number(value)

  if (!Number.isFinite(num)) {
    return "n/a"
  }

  return `${num > 0 ? "+" : ""}${num.toFixed(2)}%`
}

export function ratioPercent(value: unknown) {
  const num = Number(value)

  if (!Number.isFinite(num)) {
    return "n/a"
  }

  return percent(num * 100)
}

export function stripHtml(value: string | undefined) {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function stableId(input: string) {
  return createHash("sha256").update(input).digest("hex").slice(0, 16)
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export function boundedInteger(value: unknown, fallback: number, max: number) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(Math.floor(parsed), max)
}

export function timeoutSignal(ms: number) {
  const abortSignalTimeout = (AbortSignal as typeof AbortSignal & {
    timeout?: (milliseconds: number) => AbortSignal
  }).timeout

  if (abortSignalTimeout) {
    return abortSignalTimeout(ms)
  }

  const controller = new AbortController()

  const timeoutId = setTimeout(() => controller.abort(), ms) as ReturnType<
    typeof setTimeout
  > & { unref?: () => void }

  timeoutId.unref?.()

  return controller.signal
}
