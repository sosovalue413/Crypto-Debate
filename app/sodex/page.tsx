import type { Metadata } from "next"
import { SiteNav } from "@/components/site-nav"
import { getSodexEndpoint, getSodexMarkets } from "@/lib/sodex"
import { compactNumber, percent } from "@/lib/server-utils"
import type { SodexMarket } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "SoDEX Readiness",
  description:
    "Live SoDEX public market context and unsigned signed-write readiness for CryptoDebate verdicts.",
  alternates: {
    canonical: "/sodex",
  },
  openGraph: {
    title: "CryptoDebate SoDEX Readiness",
    description:
      "Inspect live SoDEX markets and the required signing gates before any order submission.",
    url: "/sodex",
  },
}

const readinessItems = [
  "Public market tickers are fetched live from the configured SoDEX spot endpoint.",
  "Order previews use the documented batch order path and EIP-712 readiness fields.",
  "Actual submission remains disabled until account ID, symbol precision rules, nonce, and signature are resolved.",
  "The user must confirm and sign before any write request can be sent.",
]

function formatPrice(value: string | undefined) {
  return value ? compactNumber(value, true) : "n/a"
}

function formatPercent(value: string | undefined) {
  return value ? percent(value) : "n/a"
}

function MarketRow({ market }: { market: SodexMarket }) {
  return (
    <tr className="border-b border-white/10 align-top">
      <td className="py-4 pr-4 font-semibold text-white">{market.symbol}</td>
      <td className="py-4 pr-4 text-white/70">{formatPrice(market.lastPrice)}</td>
      <td className="py-4 pr-4 text-white/70">
        {formatPercent(market.priceChangePercent)}
      </td>
      <td className="py-4 text-white/70">
        {market.quoteVolume ? compactNumber(market.quoteVolume) : "n/a"}
      </td>
    </tr>
  )
}

export default async function SodexPage() {
  let markets: SodexMarket[] = []
  let error: string | null = null

  try {
    markets = await getSodexMarkets()
  } catch (marketError) {
    error =
      marketError instanceof Error
        ? marketError.message
        : "Unable to load SoDEX market data."
  }

  return (
    <main className="min-h-screen bg-[#05070b] px-6 py-10 text-white md:px-10">
      <div className="mx-auto max-w-6xl">
        <SiteNav active="/sodex" />

        <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffee03]">
              SoDEX execution readiness
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold md:text-6xl">
              Live market context, unsigned by default
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-white/62">
              CryptoDebate uses SoDEX public spot data to show execution
              context after a debate. It prepares a signed-write intent, but it
              does not submit orders without signer credentials and explicit
              confirmation.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="border-l border-white/12 pl-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Endpoint
                </div>
                <div className="mt-2 break-all text-sm text-white/72">
                  {getSodexEndpoint()}
                </div>
              </div>
              <a
                href="https://sodex.com/documentation"
                className="border-l border-white/12 pl-4 text-sm text-white/72 transition hover:text-white"
              >
                <span className="block text-xs uppercase tracking-[0.18em] text-white/45">
                  Documentation
                </span>
                <span className="mt-2 block">SoDEX REST and signing docs</span>
              </a>
            </div>

            <div className="mt-10 overflow-x-auto border-y border-white/10">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-white/45">
                  <tr className="border-b border-white/10">
                    <th className="py-3 pr-4 font-medium">Market</th>
                    <th className="py-3 pr-4 font-medium">Last</th>
                    <th className="py-3 pr-4 font-medium">Change</th>
                    <th className="py-3 font-medium">Quote volume</th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map((market) => (
                    <MarketRow key={market.symbol} market={market} />
                  ))}
                </tbody>
              </table>
              {!markets.length ? (
                <div className="py-8 text-sm text-white/55">
                  {error ?? "No SoDEX markets returned by the endpoint."}
                </div>
              ) : null}
            </div>
          </div>

          <aside className="border-y border-white/12 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffee03]">
              Write safety
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold">
              Submission gate
            </h2>
            <div className="mt-6 space-y-4">
              {readinessItems.map((item, index) => (
                <div key={item} className="flex gap-4">
                  <span className="font-[family-name:var(--font-display)] text-xl font-bold text-[#ffee03]">
                    {(index + 1).toString().padStart(2, "0")}
                  </span>
                  <p className="text-sm leading-relaxed text-white/65">{item}</p>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
