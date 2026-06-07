import type { EvidencePoint, SodexMarket } from "@/lib/types"
import { compactNumber, percent, safeArray, stableId } from "@/lib/server-utils"

const SODEX_SPOT_ENDPOINT =
  process.env.SODEX_SPOT_ENDPOINT ??
  "https://testnet-gw.sodex.dev/api/v1/spot"

type SodexEnvelope<T> = {
  code?: number
  data?: T
  error?: unknown
}

type SodexSymbolRule = NonNullable<SodexMarket["tradingRules"]> & {
  id: number
  name: string
  displayName?: string
  raw: unknown
}

async function sodexFetch<T>(path: string) {
  const response = await fetch(`${SODEX_SPOT_ENDPOINT}${path}`, {
    headers: {
      accept: "application/json",
    },
    cache: "no-store",
  })
  const payload = (await response.json().catch(() => null)) as
    | SodexEnvelope<T>
    | T
    | null

  if (!response.ok || payload === null) {
    throw new Error(`SoDEX request failed: ${response.status}`)
  }

  if (typeof payload === "object" && "data" in payload) {
    if ((payload as SodexEnvelope<T>).code && (payload as SodexEnvelope<T>).code !== 0) {
      throw new Error("SoDEX returned a non-zero code")
    }

    return (payload as SodexEnvelope<T>).data as T
  }

  return payload as T
}

function getMarketSymbol(item: Record<string, unknown>) {
  return String(item.symbol ?? item.s ?? item.name ?? item.market ?? "")
}

function numberValue(value: unknown) {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : undefined
}

function stringValue(value: unknown) {
  return value === undefined || value === null ? undefined : String(value)
}

function parseSymbolRule(item: Record<string, unknown>): SodexSymbolRule | null {
  const id = numberValue(item.id)
  const name = stringValue(item.name)

  if (!id || !name) {
    return null
  }

  return {
    id,
    name,
    displayName: stringValue(item.displayName),
    status: stringValue(item.status),
    pricePrecision: numberValue(item.pricePrecision),
    quantityPrecision: numberValue(item.quantityPrecision),
    quoteCoinPrecision: numberValue(item.quoteCoinPrecision),
    tickSize: stringValue(item.tickSize),
    stepSize: stringValue(item.stepSize),
    marketMinQuantity: stringValue(item.marketMinQuantity),
    minNotional: stringValue(item.minNotional),
    raw: item,
  }
}

export async function getSodexSymbolRules() {
  return safeArray<Record<string, unknown>>(
    await sodexFetch<unknown>("/markets/symbols"),
  ).flatMap((item) => {
    const rule = parseSymbolRule(item)

    return rule ? [rule] : []
  })
}

export async function getSodexSymbolRule(symbol: string) {
  const wanted = symbol.trim().toUpperCase()

  if (!wanted) {
    return null
  }

  const rules = await getSodexSymbolRules()

  return (
    rules.find((rule) => rule.name.toUpperCase() === wanted) ??
    rules.find((rule) => rule.displayName?.toUpperCase() === wanted) ??
    null
  )
}

export async function getSodexMarkets(assetSymbols: string[] = []) {
  const [tickers, symbolRules] = await Promise.all([
    sodexFetch<unknown>("/markets/tickers"),
    getSodexSymbolRules().catch(() => []),
  ])
  const rulesByName = new Map(
    symbolRules.map((rule) => [rule.name.toUpperCase(), rule]),
  )
  const markets: SodexMarket[] = tickers
    ? safeArray<Record<string, unknown>>(tickers)
    .map((item) => ({
      item,
      symbol: getMarketSymbol(item),
    }))
    .filter(({ symbol }) => symbol)
    .map(({ item, symbol }) => {
      const rule = rulesByName.get(symbol.toUpperCase())

      return {
        symbol,
        symbolID: rule?.id,
        displayName: rule?.displayName,
        lastPrice: String(item.lastPrice ?? item.lastPx ?? item.price ?? item.close ?? ""),
        priceChangePercent: String(
          item.priceChangePercent ??
            item.changePct ??
            item.changePercent ??
            item.priceChange ??
            "",
        ),
        quoteVolume: String(item.quoteVolume ?? item.volume ?? item.turnover ?? ""),
        tradingRules: rule
          ? {
              status: rule.status,
              pricePrecision: rule.pricePrecision,
              quantityPrecision: rule.quantityPrecision,
              quoteCoinPrecision: rule.quoteCoinPrecision,
              tickSize: rule.tickSize,
              stepSize: rule.stepSize,
              marketMinQuantity: rule.marketMinQuantity,
              minNotional: rule.minNotional,
            }
          : undefined,
        raw: item,
      } satisfies SodexMarket
    })
    : []

  if (!assetSymbols.length) {
    return markets.slice(0, 12)
  }

  const wanted = assetSymbols.map((symbol) => symbol.toUpperCase())
  const matched = markets.filter((market) =>
    wanted.some((symbol) => market.symbol.toUpperCase().includes(symbol)),
  )

  return (matched.length ? matched : markets).slice(0, 12)
}

export async function collectSodexEvidence(assetSymbols: string[]) {
  const markets = await getSodexMarkets(assetSymbols)

  return markets.slice(0, 3).map<EvidencePoint>((market) => {
    const change = Number(market.priceChangePercent)

    return {
      id: stableId(`sodex-${market.symbol}-${JSON.stringify(market.raw)}`),
      kind: "dex",
      title: `${market.symbol} SoDEX market`,
      summary: `SoDEX testnet public ticker shows ${compactNumber(
        market.lastPrice,
        true,
      )} last price, ${percent(market.priceChangePercent)} change, and ${compactNumber(
        market.quoteVolume,
      )} quote volume when available.`,
      value: `${compactNumber(market.lastPrice, true)} / ${percent(
        market.priceChangePercent,
      )}`,
      trend: change > 1 ? "up" : change < -1 ? "down" : "flat",
      source: "SoDEX",
      sourceUrl:
        "https://sodex.com/documentation/trading-api/rest-v1/sodex-rest-spot-api",
      asOf: new Date().toISOString(),
      symbol: market.symbol,
      raw: market.raw,
    }
  })
}

export function getSodexEndpoint() {
  return SODEX_SPOT_ENDPOINT
}
