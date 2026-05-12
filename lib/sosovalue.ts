import type { EvidencePoint } from "@/lib/types"
import {
  compactNumber,
  percent,
  safeArray,
  stableId,
  stripHtml,
  toDateInput,
} from "@/lib/server-utils"

const SOSO_BASE_URL =
  process.env.SOSOVALUE_BASE_URL ?? "https://openapi.sosovalue.com/openapi/v1"

type SosoResponse<T> = {
  code: number
  message?: string
  data: T
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

let currenciesCache: {
  value: CurrencyListItem[]
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

export class SosoConfigError extends Error {
  constructor() {
    super("SOSOVALUE_API_KEY is missing")
  }
}

async function sosoFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
) {
  const apiKey = process.env.SOSOVALUE_API_KEY

  if (!apiKey) {
    throw new SosoConfigError()
  }

  const url = new URL(`${SOSO_BASE_URL}${path}`)

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value))
    }
  })

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "x-soso-api-key": apiKey,
    },
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => null)) as
    | SosoResponse<T>
    | null

  if (!response.ok || !payload || payload.code !== 0) {
    throw new Error(
      payload?.message ?? `SoSoValue request failed: ${response.status}`,
    )
  }

  return payload.data
}

async function getCurrencies() {
  if (currenciesCache && currenciesCache.expiresAt > Date.now()) {
    return currenciesCache.value
  }

  const value = await sosoFetch<CurrencyListItem[]>("/currencies")

  currenciesCache = {
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

  return Array.from(unique.values()).slice(0, 4)
}

async function marketEvidence(asset: CurrencyListItem): Promise<EvidencePoint[]> {
  const snapshot = await sosoFetch<MarketSnapshot>(
    `/currencies/${asset.currency_id}/market-snapshot`,
  )
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

  return safeArray<NewsItem>(data.list)
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
  const evidenceGroups = await Promise.allSettled([
    ...assets.flatMap((asset) => [marketEvidence(asset), technicalEvidence(asset)]),
    ...assets.map((asset) => etfEvidence(asset.symbol)),
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
  const top = safeArray<NewsItem>(data.list)[0]

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
