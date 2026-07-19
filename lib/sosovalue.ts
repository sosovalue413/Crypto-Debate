import { get, put } from "@vercel/blob"
import type { EvidencePoint } from "@/lib/types"
import {
  compactNumber,
  percent,
  ratioPercent,
  safeArray,
  stableId,
  stripHtml,
  timeoutSignal,
  toDateInput,
} from "@/lib/server-utils"

const SOSO_BASE_URL = (
  process.env.SOSOVALUE_BASE_URL ?? "https://openapi.sosovalue.com/openapi/v1"
).replace(/\/+$/, "")

type SosoResponse<T> = {
  code: number
  message?: string
  data: T | null
  details?: {
    retry_after?: number | string
    retryAfter?: number | string
  }
}

type CachedSosoResponse = {
  data: unknown
  expiresAt: number
}

type CurrencyListItem = {
  currency_id: string
  symbol: string
  name: string
}

type MarketSnapshot = {
  price?: number | string
  change_pct_24h?: number | string
  turnover_24h?: number | string
  marketcap?: number | string
  fdv?: number | string
  high_24h?: number | string
  low_24h?: number | string
  ath?: number | string
  marketcap_rank?: number
}

type Kline = {
  timestamp: number
  close: number | string
  volume?: number | string
}

type IndexSnapshot = {
  price?: number | string
  "24h_change_pct"?: number | string
  "7day_roi"?: number | string
  "1month_roi"?: number | string
  "3month_roi"?: number | string
  "1year_roi"?: number | string
  ytd?: number | string
}

type IndexConstituent = {
  currency_id: string
  symbol: string
  weight: number | string
}

type IndexKline = {
  timestamp: number
  close: number | string
}

type EtfSummary = {
  date: string
  total_net_inflow?: number | string
  total_value_traded?: number | string
  total_net_assets?: number | string
  cum_net_inflow?: number | string
}

type NewsItem = {
  id: string
  source_link?: string
  original_link?: string
  release_time?: number
  create_time?: number
  title?: string
  content?: string
  impression_count?: number
  like_count?: number
  matched_currencies?: Array<{ id: string; full_name: string; name: string }>
  tags?: string[]
}

type MacroEventDay = {
  date: string
  events: string[]
}

type MacroEventHistory = {
  date: string
  actual?: number | string
  forecast?: number | string
  previous?: number | string
}

type SosoGlobalStore = typeof globalThis & {
  __cryptodebateSosoRequests?: number[]
}

let currenciesCache: {
  value: CurrencyListItem[]
  expiresAt: number
} | null = null

let indicesCache: {
  value: string[]
  expiresAt: number
} | null = null

const ETF_SYMBOLS = new Set([
  "BTC",
  "ETH",
  "SOL",
  "LTC",
  "HBAR",
  "XRP",
  "DOGE",
  "LINK",
  "AVAX",
  "DOT",
])

const SYMBOL_ALIASES: Record<string, string> = {
  bitcoin: "BTC",
  btc: "BTC",
  ethereum: "ETH",
  ether: "ETH",
  eth: "ETH",
  solana: "SOL",
  sol: "SOL",
  ripple: "XRP",
  xrp: "XRP",
  dogecoin: "DOGE",
  doge: "DOGE",
  chainlink: "LINK",
  link: "LINK",
  avalanche: "AVAX",
  avax: "AVAX",
  polkadot: "DOT",
  dot: "DOT",
  litecoin: "LTC",
  ltc: "LTC",
  sui: "SUI",
  aptos: "APT",
  apt: "APT",
}

const SOSO_LOCAL_LIMIT = 18
const SOSO_LOCAL_WINDOW_MS = 60 * 1000
const SOSO_FETCH_TIMEOUT_MS = 12 * 1000
const SOSO_CACHE_TIMEOUT_MS = 5 * 1000

const CHINA_MACRO_TERMS = [
  "china",
  "chinese",
  "yuan",
  "cny",
  "renminbi",
  "pboc",
  "hong kong",
  "hong-kong",
  "hk",
  "asia",
  "asian",
  "stimulus",
]

const BROAD_MACRO_TERMS = [
  "macro",
  "fed",
  "fomc",
  "cpi",
  "pce",
  "inflation",
  "rate",
  "rates",
  "jobs",
  "payroll",
  "gdp",
  "liquidity",
  "dollar",
  "dxy",
  "recession",
  "employment",
  "unemployment",
  "pmi",
  "tariff",
]

export class SosoConfigError extends Error {
  constructor() {
    super("SOSOVALUE_API_KEY is missing")
  }
}

export class SosoRateLimitError extends Error {
  retryAfter: number

  constructor(message = "SoSoValue rate limit exceeded.", retryAfter = 60) {
    super(message)
    this.name = "SosoRateLimitError"
    this.retryAfter = retryAfter
  }
}

function withSosoCacheTimeout<T>(label: string, operation: Promise<T>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label} timed out after ${SOSO_CACHE_TIMEOUT_MS}ms.`)),
      SOSO_CACHE_TIMEOUT_MS,
    )
  })

  return Promise.race([operation, timeout]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  })
}

function sosoCachePath(cacheKey: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return null
  }

  const prefix =
    (process.env.CRYPTODEBATE_STORE_PREFIX ?? "cryptodebate")
      .replace(/^\/+|\/+$/g, "") || "cryptodebate"

  return `${prefix}/sosovalue-cache/${stableId(cacheKey)}.json`
}

function sosoCacheTtl(path: string) {
  if (path === "/currencies" || path === "/indices") {
    return 60 * 60 * 1000
  }

  if (path === "/macro/events") {
    return 60 * 1000
  }

  if (path.includes("/macro/events/")) {
    return 15 * 60 * 1000
  }

  if (path.includes("/klines") || path.includes("/summary-history")) {
    return 15 * 60 * 1000
  }

  return 5 * 60 * 1000
}

async function readSosoCache<T>(cacheKey: string, allowStale = false) {
  const pathname = sosoCachePath(cacheKey)

  if (!pathname) {
    return null
  }

  try {
    const blob = await withSosoCacheTimeout(
      "SoSoValue cache read",
      get(pathname, {
        access: "private",
        useCache: false,
      }),
    )

    if (!blob || blob.statusCode !== 200) {
      return null
    }

    const cached = (await withSosoCacheTimeout(
      "SoSoValue cache parse",
      new Response(blob.stream).json(),
    )) as CachedSosoResponse

    if (
      !cached ||
      typeof cached !== "object" ||
      typeof cached.expiresAt !== "number" ||
      !("data" in cached)
    ) {
      return null
    }

    if (!allowStale && cached.expiresAt <= Date.now()) {
      return null
    }

    return cached.data as T
  } catch {
    return null
  }
}

async function writeSosoCache(cacheKey: string, data: unknown, ttlMs: number) {
  const pathname = sosoCachePath(cacheKey)

  if (!pathname) {
    return
  }

  try {
    await withSosoCacheTimeout(
      "SoSoValue cache write",
      put(
        pathname,
        JSON.stringify({
          data,
          expiresAt: Date.now() + ttlMs,
        } satisfies CachedSosoResponse),
        {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: true,
          cacheControlMaxAge: 60,
          contentType: "application/json",
        },
      ),
    )
  } catch {
    return
  }
}

function reserveSosoRequestSlot() {
  const store = globalThis as SosoGlobalStore
  const now = Date.now()
  const requests =
    store.__cryptodebateSosoRequests?.filter(
      (timestamp) => now - timestamp < SOSO_LOCAL_WINDOW_MS,
    ) ?? []

  store.__cryptodebateSosoRequests = requests

  if (requests.length >= SOSO_LOCAL_LIMIT) {
    const retryAfter = Math.ceil(
      (SOSO_LOCAL_WINDOW_MS - (now - requests[0])) / 1000,
    )

    throw new SosoRateLimitError(
      "Local SoSoValue request budget exhausted before provider throttling.",
      retryAfter,
    )
  }

  requests.push(now)
}

function retryAfterSeconds<T>(response: Response, payload?: SosoResponse<T> | null) {
  const detailsRetryAfter = Number(
    payload?.details?.retry_after ?? payload?.details?.retryAfter ?? "",
  )

  if (Number.isFinite(detailsRetryAfter) && detailsRetryAfter > 0) {
    return Math.ceil(detailsRetryAfter)
  }

  const value = Number(response.headers.get("retry-after") ?? "")

  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 60
}

function rateLimitResetSeconds(response: Response) {
  const reset = Number(response.headers.get("x-ratelimit-reset") ?? "")

  if (!Number.isFinite(reset) || reset <= Date.now()) {
    return null
  }

  return Math.ceil((reset - Date.now()) / 1000)
}

function isRateLimit(
  response: Response,
  payload: SosoResponse<unknown> | null,
) {
  return (
    response.status === 429 ||
    payload?.code === 42901 ||
    payload?.code === 402901 ||
    /rate limit|too many requests/i.test(payload?.message ?? "")
  )
}

async function sosoFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
) {
  const apiKey = process.env.SOSOVALUE_API_KEY?.trim()

  if (!apiKey) {
    throw new SosoConfigError()
  }

  const url = new URL(`${SOSO_BASE_URL}${path}`)

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value))
    }
  })

  const cacheKey = url.toString()
  const cached = await readSosoCache<T>(cacheKey)

  if (cached) {
    return cached
  }

  reserveSosoRequestSlot()

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "x-soso-api-key": apiKey,
    },
    cache: "no-store",
    signal: timeoutSignal(SOSO_FETCH_TIMEOUT_MS),
  })

  const payload = (await response.json().catch(() => null)) as
    | SosoResponse<T>
    | null

  if (!response.ok || !payload || payload.code !== 0) {
    if (isRateLimit(response, payload)) {
      const stale = await readSosoCache<T>(cacheKey, true)

      if (stale) {
        return stale
      }

      throw new SosoRateLimitError(
        payload?.message ?? "SoSoValue rate limit exceeded.",
        rateLimitResetSeconds(response) ?? retryAfterSeconds(response, payload),
      )
    }

    throw new Error(
      payload?.message ?? `SoSoValue request failed: ${response.status}`,
    )
  }

  await writeSosoCache(cacheKey, payload.data, sosoCacheTtl(path))

  return payload.data
}

async function getCurrencies() {
  if (currenciesCache && currenciesCache.expiresAt > Date.now()) {
    return currenciesCache.value
  }

  const value = safeArray<CurrencyListItem>(
    await sosoFetch<CurrencyListItem[]>("/currencies"),
  )

  currenciesCache = {
    value,
    expiresAt: Date.now() + 60 * 60 * 1000,
  }

  return value
}

async function getIndices() {
  if (indicesCache && indicesCache.expiresAt > Date.now()) {
    return indicesCache.value
  }

  const value = safeArray<string>(await sosoFetch<unknown>("/indices"))
    .map((ticker) => ticker.toLowerCase())
    .filter(Boolean)

  indicesCache = {
    value,
    expiresAt: Date.now() + 60 * 60 * 1000,
  }

  return value
}

export async function resolveAssets(thesis: string) {
  const currencies = await getCurrencies()
  const lowerThesis = thesis.toLowerCase()
  const words = new Set(lowerThesis.match(/[a-z0-9]+/g) ?? [])
  const upperTokens = new Set((thesis.match(/\b[A-Z0-9]{2,10}\b/g) ?? []))
  const wantedSymbols = new Set<string>()

  for (const word of words) {
    if (SYMBOL_ALIASES[word]) {
      wantedSymbols.add(SYMBOL_ALIASES[word])
    }
  }

  for (const token of upperTokens) {
    wantedSymbols.add(token)
  }

  const matches = currencies.filter((currency) => {
    const symbol = currency.symbol?.toUpperCase()
    const name = currency.name?.toLowerCase()

    return (
      wantedSymbols.has(symbol) ||
      lowerThesis.includes(` ${name} `) ||
      lowerThesis.startsWith(`${name} `) ||
      lowerThesis.endsWith(` ${name}`)
    )
  })

  const unique = new Map<string, CurrencyListItem>()

  for (const match of matches) {
    unique.set(match.symbol.toUpperCase(), {
      ...match,
      symbol: match.symbol.toUpperCase(),
    })
  }

  return Array.from(unique.values()).slice(0, 3)
}

async function marketEvidence(asset: CurrencyListItem): Promise<EvidencePoint[]> {
  const snapshot =
    (await sosoFetch<MarketSnapshot>(
      `/currencies/${asset.currency_id}/market-snapshot`,
    )) ?? {}
  const change = Number(snapshot.change_pct_24h)
  const price = compactNumber(snapshot.price, true)
  const marketcap = compactNumber(snapshot.marketcap, true)

  return [
    {
      id: stableId(`market-${asset.symbol}-${JSON.stringify(snapshot)}`),
      kind: "market",
      title: `${asset.symbol} market snapshot`,
      summary: `${asset.name} trades near ${price} with ${percent(
        snapshot.change_pct_24h,
      )} 24h movement and ${marketcap} market cap.`,
      value: `${price} / ${percent(snapshot.change_pct_24h)} 24h`,
      trend: change > 1 ? "up" : change < -1 ? "down" : "flat",
      source: "SoSoValue",
      sourceUrl: `https://sosovalue-1.gitbook.io/sosovalue-api-doc/1.-currency-and-pairs/market-snapshot`,
      asOf: new Date().toISOString(),
      symbol: asset.symbol,
      raw: snapshot,
    },
  ]
}

async function technicalEvidence(asset: CurrencyListItem): Promise<EvidencePoint[]> {
  const end = Date.now()
  const start = end - 31 * 24 * 60 * 60 * 1000
  const klines = await sosoFetch<Kline[]>(
    `/currencies/${asset.currency_id}/klines`,
    {
      interval: "1d",
      start_time: start,
      end_time: end,
      limit: 31,
    },
  )
  const closes = safeArray<Kline>(klines)
    .map((item) => ({
      label: new Date(Number(item.timestamp)).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      value: Number(item.close),
    }))
    .filter((item) => Number.isFinite(item.value))

  if (closes.length < 2) {
    return []
  }

  const first = closes[0].value
  const last = closes[closes.length - 1].value
  const move = ((last - first) / first) * 100

  return [
    {
      id: stableId(`technical-${asset.symbol}-${first}-${last}`),
      kind: "technical",
      title: `${asset.symbol} 30-day price path`,
      summary: `${asset.symbol} moved ${percent(
        move,
      )} across the latest daily SoSoValue kline window.`,
      value: `${percent(move)} in 30D`,
      trend: move > 3 ? "up" : move < -3 ? "down" : "flat",
      source: "SoSoValue",
      sourceUrl: `https://sosovalue-1.gitbook.io/sosovalue-api-doc/1.-currency-and-pairs/klines`,
      asOf: new Date().toISOString(),
      symbol: asset.symbol,
      raw: klines,
      series: closes,
    },
  ]
}

async function etfEvidence(symbol: string): Promise<EvidencePoint[]> {
  if (!ETF_SYMBOLS.has(symbol)) {
    return []
  }

  const end = new Date()
  const start = new Date(end)
  start.setDate(end.getDate() - 29)

  const history = await sosoFetch<EtfSummary[]>("/etfs/summary-history", {
    symbol,
    country_code: "US",
    start_date: toDateInput(start),
    end_date: toDateInput(end),
    limit: 30,
  })
  const rows = safeArray<EtfSummary>(history)

  if (!rows.length) {
    return []
  }

  const latest = rows[0]
  const sevenDayFlow = rows
    .slice(0, 7)
    .reduce((sum, row) => sum + Number(row.total_net_inflow ?? 0), 0)
  const series = rows
    .slice()
    .reverse()
    .map((row) => ({
      label: row.date,
      value: Number(row.total_net_inflow ?? 0),
    }))
    .filter((row) => Number.isFinite(row.value))

  return [
    {
      id: stableId(`etf-${symbol}-${latest.date}-${sevenDayFlow}`),
      kind: "flow",
      title: `${symbol} ETF flow pulse`,
      summary: `US spot ${symbol} ETFs show ${compactNumber(
        latest.total_net_inflow,
        true,
      )} latest daily net flow and ${compactNumber(
        sevenDayFlow,
        true,
      )} over the latest seven records.`,
      value: `${compactNumber(sevenDayFlow, true)} latest 7 records`,
      trend: sevenDayFlow > 0 ? "up" : sevenDayFlow < 0 ? "down" : "flat",
      source: "SoSoValue",
      sourceUrl:
        "https://sosovalue-1.gitbook.io/sosovalue-api-doc/2.-etf/summary-history",
      asOf: latest.date,
      symbol,
      raw: rows,
      series,
    },
  ]
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

async function getIndexConstituents(ticker: string) {
  return safeArray<IndexConstituent>(
    await sosoFetch<IndexConstituent[]>(`/indices/${ticker}/constituents`),
  )
}

async function indexEvidenceForTicker(
  ticker: string,
  knownConstituents?: IndexConstituent[],
): Promise<EvidencePoint[]> {
  const end = Date.now()
  const start = end - 31 * 24 * 60 * 60 * 1000
  const [snapshotData, klines] = await Promise.all([
    sosoFetch<IndexSnapshot>(`/indices/${ticker}/market-snapshot`),
    sosoFetch<IndexKline[]>(`/indices/${ticker}/klines`, {
      interval: "1d",
      start_time: start,
      end_time: end,
      limit: 31,
    }),
  ])
  const snapshot = snapshotData ?? {}
  const rows = knownConstituents ?? (await getIndexConstituents(ticker))
  const topConstituents = rows
    .slice()
    .sort((a, b) => Number(b.weight) - Number(a.weight))
    .slice(0, 4)
    .map((item) => `${item.symbol.toUpperCase()} ${ratioPercent(item.weight)}`)
  const oneMonthRoi = Number(snapshot["1month_roi"])
  const series = safeArray<IndexKline>(klines)
    .map((item) => ({
      label: new Date(Number(item.timestamp)).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      value: Number(item.close),
    }))
    .filter((item) => Number.isFinite(item.value))

  return [
    {
      id: stableId(`index-${ticker}-${JSON.stringify(snapshot)}`),
      kind: "index",
      title: `${ticker.toUpperCase()} SoSoValue Index`,
      summary: `SoSoValue Indexes shows ${ticker.toUpperCase()} near ${compactNumber(
        snapshot.price,
      )}, with ${ratioPercent(snapshot["24h_change_pct"])} 24h return and ${ratioPercent(
        snapshot["1month_roi"],
      )} 1M return. Top constituents: ${topConstituents.join(", ") || "n/a"}.`,
      value: `${ratioPercent(snapshot["1month_roi"])} 1M / ${ratioPercent(
        snapshot.ytd,
      )} YTD`,
      trend: oneMonthRoi > 0.03 ? "up" : oneMonthRoi < -0.03 ? "down" : "flat",
      source: "SoSoValue Indexes",
      sourceUrl:
        "https://sosovalue-1.gitbook.io/sosovalue-api-doc/3.-sosovalue-index/market-snapshot",
      asOf: new Date().toISOString(),
      symbol: ticker.toUpperCase(),
      raw: {
        snapshot,
        constituents: rows,
      },
      series,
    },
  ]
}

async function indexEvidence(
  thesis: string,
  assetSymbols: string[],
): Promise<EvidencePoint[]> {
  const indices = await getIndices()

  if (!indices.length) {
    return []
  }

  const lowerThesis = thesis.toLowerCase()
  const directMatches = indices.filter((ticker) => lowerThesis.includes(ticker))
  const thematicMatches = indices.filter((ticker) => {
    if (lowerThesis.includes("layer 1") || lowerThesis.includes(" l1 ")) {
      return ticker.includes("layer1")
    }

    if (lowerThesis.includes("mag7") || lowerThesis.includes("magnificent")) {
      return ticker.includes("mag7")
    }

    return false
  })
  const candidates = uniqueStrings([
    ...directMatches,
    ...thematicMatches,
    ...indices.slice(0, 2),
  ]).slice(0, 3)
  const assetSet = new Set(assetSymbols.map((symbol) => symbol.toUpperCase()))
  const constituentResults = await Promise.allSettled(
    candidates.map(async (ticker) => ({
      ticker,
      constituents: await getIndexConstituents(ticker),
    })),
  )
  const constituentMatches = constituentResults
    .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
    .filter((result) =>
      safeArray<IndexConstituent>(result.constituents).some((item) =>
        assetSet.has(item.symbol.toUpperCase()),
      ),
    )
    .map((result) => result.ticker)

  const chosen = uniqueStrings([
    ...directMatches,
    ...thematicMatches,
    ...constituentMatches,
    lowerThesis.includes("ssi") || lowerThesis.includes("index")
      ? candidates[0]
      : "",
  ]).slice(0, 1)

  if (!chosen.length) {
    return []
  }

  const constituentsByTicker = new Map(
    constituentResults.flatMap((result) =>
      result.status === "fulfilled"
        ? [[result.value.ticker, result.value.constituents] as const]
        : [],
    ),
  )
  const evidenceGroups = await Promise.allSettled(
    chosen.map((ticker) =>
      indexEvidenceForTicker(ticker, constituentsByTicker.get(ticker)),
    ),
  )

  return evidenceGroups.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  )
}

function lowerIncludesAny(text: string, terms: string[]) {
  const normalizedText = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `

  return terms.some((term) =>
    normalizedText.includes(
      ` ${term.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `,
    ),
  )
}

function macroEventTime(date: string) {
  const time = new Date(`${date}T00:00:00Z`).getTime()

  return Number.isFinite(time) ? time : 0
}

function macroRelevanceScore(input: {
  event: string
  date: string
  thesis: string
  today: string
}) {
  const event = input.event.toLowerCase()
  const thesis = input.thesis.toLowerCase()
  let score = 0

  if (input.date >= input.today) {
    score += 2
  }

  if (lowerIncludesAny(thesis, CHINA_MACRO_TERMS)) {
    score += lowerIncludesAny(event, CHINA_MACRO_TERMS) ? 12 : 0
  }

  for (const term of [...CHINA_MACRO_TERMS, ...BROAD_MACRO_TERMS]) {
    if (thesis.includes(term) && event.includes(term)) {
      score += 4
    } else if (event.includes(term)) {
      score += 1
    }
  }

  return score
}

function chooseMacroEvent(thesis: string, days: MacroEventDay[]) {
  const today = toDateInput(new Date())
  const events = days
    .flatMap((day) =>
      safeArray<string>(day.events).map((event) => ({
        date: day.date,
        event,
        score: macroRelevanceScore({
          event,
          date: day.date,
          thesis,
          today,
        }),
      })),
    )
    .filter((item) => item.event && item.date)

  if (!events.length) {
    return null
  }

  return events
    .slice()
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }

      const aFuture = a.date >= today
      const bFuture = b.date >= today

      if (aFuture !== bFuture) {
        return aFuture ? -1 : 1
      }

      return aFuture
        ? macroEventTime(a.date) - macroEventTime(b.date)
        : macroEventTime(b.date) - macroEventTime(a.date)
    })[0]
}

async function macroEvidence(thesis: string): Promise<EvidencePoint[]> {
  const calendar = safeArray<MacroEventDay>(
    await sosoFetch<MacroEventDay[]>("/macro/events"),
  )
  const selected = chooseMacroEvent(thesis, calendar)

  if (!selected) {
    return []
  }

  const end = new Date()
  const start = new Date(end)
  start.setFullYear(end.getFullYear() - 1)

  let history: MacroEventHistory[] = []

  try {
    history = safeArray<MacroEventHistory>(
      await sosoFetch<MacroEventHistory[]>(
        `/macro/events/${encodeURIComponent(selected.event)}/history`,
        {
          start_date: toDateInput(start),
          end_date: toDateInput(end),
          limit: 12,
        },
      ),
    )
  } catch {
    history = []
  }

  const series = history
    .slice()
    .sort((a, b) => macroEventTime(a.date) - macroEventTime(b.date))
    .map((row) => ({
      label: row.date,
      value: Number(row.actual),
    }))
    .filter((row) => Number.isFinite(row.value))
  const latest = history
    .slice()
    .sort((a, b) => macroEventTime(b.date) - macroEventTime(a.date))[0]
  const thesisLower = thesis.toLowerCase()
  const isChinaThesis = lowerIncludesAny(thesisLower, CHINA_MACRO_TERMS)
  const eventMatchesChina = lowerIncludesAny(
    selected.event.toLowerCase(),
    CHINA_MACRO_TERMS,
  )
  const selectionContext =
    isChinaThesis && !eventMatchesChina
      ? "No China-specific event was returned in the live SoSoValue macro calendar, so this card uses the highest-ranked available macro event for cross-market context."
      : `${selected.event} is on the live SoSoValue macro calendar for ${selected.date}.`

  return [
    {
      id: stableId(
        `macro-${selected.event}-${selected.date}-${JSON.stringify(latest)}`,
      ),
      kind: "macro",
      title: `${isChinaThesis ? "China macro watch" : "Macro watch"}: ${
        selected.event
      }`,
      summary: latest
        ? `${selectionContext} Latest history shows actual ${compactNumber(
            latest.actual,
          )}, forecast ${compactNumber(latest.forecast)}, previous ${compactNumber(
            latest.previous,
          )}.`
        : `${selectionContext} No historical actual/forecast record was returned for this event.`,
      value: latest
        ? `Actual ${compactNumber(latest.actual)} / forecast ${compactNumber(
            latest.forecast,
          )}`
        : `Next ${selected.date}`,
      trend: "mixed",
      source: "SoSoValue",
      sourceUrl:
        "https://sosovalue-1.gitbook.io/sosovalue-api-doc/8.-macro/events",
      asOf: new Date().toISOString(),
      raw: {
        selected,
        history,
      },
      series: series.length >= 2 ? series : undefined,
    },
  ]
}

async function newsEvidence(asset?: CurrencyListItem): Promise<EvidencePoint[]> {
  const data = asset
    ? await sosoFetch<{ list: NewsItem[] }>("/news", {
        currency_id: asset.currency_id,
        page: 1,
        page_size: 6,
        language: "en",
      })
    : await sosoFetch<{ list: NewsItem[] }>("/news/hot", {
        page: 1,
        page_size: 6,
        language: "en",
      })

  return safeArray<NewsItem>(data?.list)
    .slice(0, 3)
    .map((item) => {
      const title = item.title?.trim() || "Current crypto news"
      const when = item.release_time ?? item.create_time ?? Date.now()

      return {
        id: stableId(`news-${item.id}-${title}`),
        kind: "news",
        title,
        summary:
          stripHtml(item.content).slice(0, 220) ||
          "A live SoSoValue news item connected to the current thesis.",
        value: `${compactNumber(item.impression_count)} impressions`,
        trend: "mixed" as const,
        source: "SoSoValue" as const,
        sourceUrl:
          item.source_link ??
          item.original_link ??
          "https://sosovalue-1.gitbook.io/sosovalue-api-doc/6.-feeds/news",
        asOf: new Date(when).toISOString(),
        symbol: asset?.symbol ?? item.matched_currencies?.[0]?.name,
        raw: item,
      }
    })
}

export async function collectSosoEvidence(thesis: string) {
  const assets = await resolveAssets(` ${thesis} `)
  const assetSymbols = assets.map((asset) => asset.symbol)
  const evidenceGroups = await Promise.allSettled([
    ...assets.flatMap((asset) => [marketEvidence(asset), technicalEvidence(asset)]),
    ...assets.slice(0, 2).map((asset) => etfEvidence(asset.symbol)),
    indexEvidence(thesis, assetSymbols),
    macroEvidence(thesis),
    newsEvidence(assets[0]),
  ])

  const evidence = evidenceGroups.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  )

  if (!evidence.length) {
    evidence.push(...(await newsEvidence()))
  }

  return {
    assets,
    evidence,
  }
}

export async function getFeaturedSosoTopic() {
  const data = await sosoFetch<{ list: NewsItem[] }>("/news/hot", {
    page: 1,
    page_size: 8,
    language: "en",
  })
  const top = safeArray<NewsItem>(data?.list)[0]

  if (!top) {
    return null
  }

  const symbol =
    top.matched_currencies?.[0]?.name ??
    top.tags?.find((tag) => /^[A-Z0-9]{2,10}$/.test(tag)) ??
    "crypto"

  return {
    thesis: `Is ${symbol} still a high-conviction trade after "${top.title}"?`,
    title: top.title ?? "Daily crypto debate",
    sourceUrl: top.source_link ?? top.original_link,
    raw: top,
  }
}
