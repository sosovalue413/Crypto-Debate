import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getDebate } from "@/lib/debate-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type DebatePageProps = {
  params: Promise<{
    id: string
  }>
}

export async function generateMetadata({
  params,
}: DebatePageProps): Promise<Metadata> {
  const { id } = await params
  const debate = await getDebate(id)

  if (!debate) {
    return {
      title: "Debate not found · CryptoDebate",
    }
  }

  return {
    title: `${debate.title} · CryptoDebate`,
    description: debate.quickVerdict.verdict,
    openGraph: {
      title: debate.title,
      description: debate.quickVerdict.verdict,
      type: "article",
    },
  }
}

function totalVotes(votes: { bull: number; bear: number; draw: number }) {
  return votes.bull + votes.bear + votes.draw
}

function votePercent(value: number, total: number) {
  return total ? `${Math.round((value / total) * 100)}%` : "0%"
}

export default async function DebatePage({ params }: DebatePageProps) {
  const { id } = await params
  const debate = await getDebate(id)

  if (!debate) {
    notFound()
  }

  const total = totalVotes(debate.votes)
  const baseline = debate.outcomeTracker.baselineEvidenceIds
    .map((evidenceId) => debate.evidence.find((item) => item.id === evidenceId))
    .filter(Boolean)

  return (
    <main className="min-h-screen bg-[#05070b] px-6 py-10 text-white md:px-10">
      <div className="mx-auto max-w-6xl">
        <nav className="mb-10 flex items-center justify-between text-sm">
          <Link href="/" className="font-semibold text-[#ffee03]">
            CryptoDebate
          </Link>
          <Link href="/archive" className="text-white/60 hover:text-white">
            Archive
          </Link>
        </nav>

        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffee03]">
          Public debate
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold md:text-6xl">
          {debate.title}
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-white/62">
          {debate.thesis}
        </p>

        <section className="mt-10 grid gap-6 md:grid-cols-3">
          <Metric label="Winner lean" value={debate.winnerLean} />
          <Metric label="Confidence" value={`${debate.confidenceScore}/100`} />
          <Metric label="Grounding" value={debate.grounding.status} />
        </section>

        <section className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-8">
            <div className="border-y border-white/12 py-5">
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
                Decision brief
              </h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <TextBlock label="Strongest bull" text={debate.decisionBrief.strongestBull} />
                <TextBlock label="Strongest bear" text={debate.decisionBrief.strongestBear} />
              </div>
              <p className="mt-5 text-sm leading-relaxed text-white/60">
                {debate.balancedConclusion}
              </p>
            </div>

            {debate.rounds.map((round) => (
              <article key={round.round} className="border-y border-white/12 py-5">
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
                  {round.label}
                </h2>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <TextBlock label="Bull" text={round.bull.argument} />
                  <TextBlock label="Bear" text={round.bear.argument} />
                </div>
              </article>
            ))}
          </div>

          <aside className="space-y-8">
            <div className="border-y border-white/12 py-5">
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
                Community vote
              </h2>
              <div className="mt-5 space-y-3 text-sm text-white/60">
                <div>Bull {votePercent(debate.votes.bull, total)}</div>
                <div>Bear {votePercent(debate.votes.bear, total)}</div>
                <div>Draw {votePercent(debate.votes.draw, total)}</div>
              </div>
            </div>

            <div className="border-y border-white/12 py-5">
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
                Outcome baseline
              </h2>
              <div className="mt-4 space-y-2">
                {baseline.map((item) => (
                  <div key={item?.id} className="text-sm text-white/60">
                    {item?.title}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-y border-white/12 py-5">
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
                Evidence
              </h2>
              <div className="mt-4 space-y-3">
                {debate.evidence.slice(0, 8).map((item) => (
                  <a
                    key={item.id}
                    href={item.sourceUrl}
                    className="block border-l border-white/12 pl-3 text-sm text-white/60 hover:text-white"
                  >
                    {item.title} · {item.value}
                  </a>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-white/12 pl-4">
      <div className="text-xs uppercase tracking-[0.18em] text-white/45">
        {label}
      </div>
      <div className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold text-[#ffee03]">
        {value}
      </div>
    </div>
  )
}

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="border-l border-white/12 pl-4">
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#ffee03]">
        {label}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-white/65">{text}</p>
    </div>
  )
}
