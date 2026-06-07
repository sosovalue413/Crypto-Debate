import type { Metadata } from "next"
import Link from "next/link"
import { SiteNav } from "@/components/site-nav"
import {
  getAssetVoteHistory,
  getStoreBackend,
  listDebates,
} from "@/lib/debate-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Archive",
  description:
    "Search saved CryptoDebate research, public debate pages, community votes, and grounding status.",
  alternates: {
    canonical: "/archive",
  },
  openGraph: {
    title: "CryptoDebate Archive",
    description:
      "Search saved AI crypto debates with live evidence, community votes, and grounding status.",
    url: "/archive",
  },
}

function totalVotes(votes: { bull: number; bear: number; draw: number }) {
  return votes.bull + votes.bear + votes.draw
}

function votePercent(value: number, total: number) {
  return total ? `${Math.round((value / total) * 100)}%` : "0%"
}

type ArchivePageProps = {
  searchParams?: Promise<{
    q?: string
  }>
}

function matchesQuery(
  debate: Awaited<ReturnType<typeof listDebates>>[number],
  query: string,
) {
  if (!query) {
    return true
  }

  return [
    debate.thesis,
    debate.title,
    debate.assetSymbols.join(" "),
    debate.winnerLean,
    debate.grounding.status,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query)
}

export default async function ArchivePage({ searchParams }: ArchivePageProps) {
  const params = await searchParams
  const query = (params?.q ?? "").trim().toLowerCase()
  const [debates, assetVotes] = await Promise.all([
    listDebates(50),
    getAssetVoteHistory(100),
  ])
  const filteredDebates = debates.filter((debate) => matchesQuery(debate, query))
  const storage = getStoreBackend()

  return (
    <main className="min-h-screen bg-[#05070b] px-6 py-10 text-white md:px-10">
      <div className="mx-auto max-w-6xl">
        <SiteNav active="/archive" />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section>
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffee03]">
                  Public archive
                </p>
                <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold md:text-6xl">
                  Debate memory
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/58">
                  Server-backed research history with one persistent community
                  ballot per browser voter. Current storage: {storage}.
                </p>
              </div>

              <form action="/archive" className="min-w-0 md:w-80">
                <label
                  htmlFor="archive-search"
                  className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45"
                >
                  Search
                </label>
                <input
                  id="archive-search"
                  name="q"
                  defaultValue={params?.q ?? ""}
                  placeholder="Token, thesis, winner, grounding"
                  className="mt-2 w-full border-b border-white/20 bg-transparent pb-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#ffee03]/70"
                />
              </form>
            </div>

            <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
              {filteredDebates.map((debate) => {
                const total = totalVotes(debate.votes)

                return (
                  <Link
                    key={debate.id}
                    href={`/debate/${debate.id}`}
                    className="grid gap-4 py-5 transition hover:bg-white/[0.03] md:grid-cols-[1fr_150px_150px]"
                  >
                    <div>
                      <div className="font-semibold">{debate.thesis}</div>
                      <div className="mt-1 text-sm text-white/50">
                        {debate.assetSymbols.join(", ") || "Market-wide"} ·{" "}
                        {new Date(debate.generatedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-sm text-white/60">
                      {debate.grounding.status} grounding
                    </div>
                    <div className="text-sm text-white/60">
                      Bull {votePercent(debate.votes.bull, total)} · Bear{" "}
                      {votePercent(debate.votes.bear, total)}
                    </div>
                  </Link>
                )
              })}
              {!filteredDebates.length ? (
                <div className="py-8 text-white/55">
                  {debates.length
                    ? "No saved debates match this search."
                    : "No debates have been saved yet."}
                </div>
              ) : null}
            </div>
          </section>

          <aside className="border-y border-white/12 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffee03]">
              Asset signal
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold">
              Vote history
            </h2>
            <div className="mt-6 space-y-4">
              {assetVotes.slice(0, 10).map((item) => {
                const total = totalVotes(item.votes)

                return (
                  <div key={item.symbol} className="border-l border-white/12 pl-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{item.symbol}</span>
                      <span className="text-xs text-white/45">
                        {item.debates} debates
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-white/55">
                      Bull {votePercent(item.votes.bull, total)} · Bear{" "}
                      {votePercent(item.votes.bear, total)} · Draw{" "}
                      {votePercent(item.votes.draw, total)}
                    </div>
                  </div>
                )
              })}
              {!assetVotes.length ? (
                <div className="text-sm text-white/55">No votes yet.</div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
