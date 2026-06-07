import Link from "next/link"
import { getAssetVoteHistory, listDebates } from "@/lib/debate-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function totalVotes(votes: { bull: number; bear: number; draw: number }) {
  return votes.bull + votes.bear + votes.draw
}

function votePercent(value: number, total: number) {
  return total ? `${Math.round((value / total) * 100)}%` : "0%"
}

export default async function ArchivePage() {
  const [debates, assetVotes] = await Promise.all([
    listDebates(50),
    getAssetVoteHistory(100),
  ])

  return (
    <main className="min-h-screen bg-[#05070b] px-6 py-10 text-white md:px-10">
      <div className="mx-auto max-w-6xl">
        <nav className="mb-10 flex items-center justify-between text-sm">
          <Link href="/" className="font-semibold text-[#ffee03]">
            CryptoDebate
          </Link>
          <Link href="/methodology" className="text-white/60 hover:text-white">
            Methodology
          </Link>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffee03]">
              Public archive
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold md:text-6xl">
              Debate memory
            </h1>
            <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
              {debates.map((debate) => {
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
              {!debates.length ? (
                <div className="py-8 text-white/55">
                  No debates have been saved yet.
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
