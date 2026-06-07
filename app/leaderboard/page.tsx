import type { Metadata } from "next"
import Link from "next/link"
import { SiteNav } from "@/components/site-nav"
import { getStoreBackend, listDebates } from "@/lib/debate-store"
import {
  buildAnalystSummary,
  buildAssetLeaderboard,
  buildDebateLeaderboard,
  formatPercent,
} from "@/lib/leaderboard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Leaderboard",
  description:
    "Analyst score, top debates, and asset vote signal from saved CryptoDebate research.",
  alternates: {
    canonical: "/leaderboard",
  },
  openGraph: {
    title: "CryptoDebate Leaderboard",
    description:
      "Track debate quality, grounding, confidence, evidence count, and community asset lean.",
    url: "/leaderboard",
  },
}

export default async function LeaderboardPage() {
  const debates = await listDebates(100)
  const summary = buildAnalystSummary(debates)
  const assets = buildAssetLeaderboard(debates).slice(0, 12)
  const topDebates = buildDebateLeaderboard(debates, 10)
  const storage = getStoreBackend()

  return (
    <main className="min-h-screen bg-[#05070b] px-6 py-10 text-white md:px-10">
      <div className="mx-auto max-w-6xl">
        <SiteNav active="/leaderboard" />

        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffee03]">
            Analyst score
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold md:text-6xl">
            Debate quality and asset signal
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-white/62">
            The leaderboard turns saved debates, grounding status, evidence
            count, outcome tracking, and community votes into a visible product
            signal for the hackathon demo.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-4">
            <Metric label="Debates" value={summary.debateCount.toString()} />
            <Metric label="Evidence cards" value={summary.evidenceCount.toString()} />
            <Metric label="Votes" value={summary.voteCount.toString()} />
            <Metric label="Score" value={summary.reputationScore.toString()} />
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="border-y border-white/10">
              <div className="grid grid-cols-[1fr_90px_100px] gap-4 border-b border-white/10 py-3 text-xs uppercase tracking-[0.18em] text-white/45 md:grid-cols-[1fr_100px_120px_120px]">
                <div>Debate</div>
                <div>Confidence</div>
                <div>Votes</div>
                <div className="hidden md:block">Grounding</div>
              </div>
              {topDebates.map((debate) => (
                <Link
                  key={debate.id}
                  href={`/debate/${debate.id}`}
                  className="grid grid-cols-[1fr_90px_100px] gap-4 border-b border-white/10 py-4 text-sm transition hover:bg-white/[0.03] md:grid-cols-[1fr_100px_120px_120px]"
                >
                  <div>
                    <div className="font-semibold text-white">{debate.title}</div>
                    <div className="mt-1 line-clamp-2 text-white/50">
                      {debate.thesis}
                    </div>
                  </div>
                  <div className="text-white/70">{debate.confidenceScore}/100</div>
                  <div className="text-white/70">{debate.voteCount}</div>
                  <div className="hidden text-white/70 md:block">
                    {debate.groundingStatus}
                  </div>
                </Link>
              ))}
              {!topDebates.length ? (
                <div className="py-8 text-sm text-white/55">
                  No debates have been saved yet.
                </div>
              ) : null}
            </div>

            <aside className="border-y border-white/12 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffee03]">
                Asset leaderboard
              </p>
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold">
                Community lean
              </h2>
              <div className="mt-6 space-y-3 border-y border-white/10 py-4">
                <StatLine label="Archive store" value={storage} />
                <StatLine
                  label="Avg confidence"
                  value={`${summary.averageConfidence}/100`}
                />
                <StatLine label="Verified" value={summary.verifiedCount.toString()} />
                <StatLine
                  label="Outcome tracking"
                  value={summary.trackedOutcomeCount.toString()}
                />
              </div>
              <div className="mt-6 space-y-4">
                {assets.map((asset) => {
                  const leader =
                    asset.leader === "draw"
                      ? "Draw"
                      : asset.leader === "bull"
                        ? "Bull"
                        : "Bear"

                  return (
                    <div key={asset.symbol} className="border-l border-white/12 pl-3">
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-semibold">{asset.symbol}</span>
                        <span className="text-xs text-white/45">
                          {asset.debates} debates
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-white/55">
                        {leader} leads with {formatPercent(asset.leaderShare)} of{" "}
                        {asset.totalVotes} votes
                      </div>
                    </div>
                  )
                })}
                {!assets.length ? (
                  <div className="text-sm text-white/55">No vote signal yet.</div>
                ) : null}
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  )
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-white/55">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-white/12 pl-4">
      <div className="text-xs uppercase tracking-[0.18em] text-white/45">
        {label}
      </div>
      <div className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-[#ffee03]">
        {value}
      </div>
    </div>
  )
}
