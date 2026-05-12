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

export async function getSodexMarkets(assetSymbols: string[] = []) {
  const tickers = safeArray<Record<string, unknown>>(
    await sodexFetch<unknown>("/markets/tickers"),
  )
  const markets: SodexMarket[] = tickers
    .map((item) => ({
      symbol: getMarketSymbol(item),
      lastPrice: String(item.lastPrice ?? item.lastPx ?? item.price ?? item.close ?? ""),
      priceChangePercent: String(
        item.priceChangePercent ??
          item.changePct ??
          item.changePercent ??
          item.priceChange ??
          "",
      ),
      quoteVolume: String(item.quoteVolume ?? item.volume ?? item.turnover ?? ""),
      raw: item,
    }))
    .filter((item) => item.symbol)

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
      sourceUrl: "https://sodex.com/documentation/api/rest-v1/sodex-rest-spot-api",
      asOf: new Date().toISOString(),
      symbol: market.symbol,
      raw: market.raw,
    }
  })
}

export function getSodexEndpoint() {
  return SODEX_SPOT_ENDPOINT
}
