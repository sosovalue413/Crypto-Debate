import type { DebateResult, DebateSide, DebateVotes } from "@/lib/types"

export type AnalystSummary = {
  debateCount: number
  evidenceCount: number
  voteCount: number
  averageConfidence: number
  verifiedCount: number
  repairedCount: number
  limitedCount: number
  trackedOutcomeCount: number
  reputationScore: number
}

export type AssetLeaderboardRow = {
  symbol: string
  debates: number
  votes: DebateVotes
  totalVotes: number
  leader: DebateSide
  leaderShare: number
  latestDebateAt: string
}

export type DebateLeaderboardRow = {
  id: string
  thesis: string
  title: string
  generatedAt: string
  winnerLean: DebateResult["winnerLean"]
  confidenceScore: number
  evidenceCount: number
  voteCount: number
  groundingStatus: DebateResult["grounding"]["status"]
  score: number
}

const emptyVotes: DebateVotes = {
  bull: 0,
  bear: 0,
  draw: 0,
}

export function totalVotes(votes: DebateVotes) {
  return votes.bull + votes.bear + votes.draw
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0%"
  }

  return `${Math.round(value * 100)}%`
}

function average(values: number[]) {
  if (!values.length) {
    return 0
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function leadingSide(votes: DebateVotes): DebateSide {
  const entries = Object.entries(votes) as Array<[DebateSide, number]>

  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? "draw"
}

function groundingBonus(status: DebateResult["grounding"]["status"]) {
  if (status === "verified") {
    return 15
  }

  if (status === "repaired") {
    return 8
  }

  return 2
}

export function buildAnalystSummary(debates: DebateResult[]): AnalystSummary {
  const evidenceCount = debates.reduce(
    (sum, debate) => sum + debate.evidence.length,
    0,
  )
  const voteCount = debates.reduce(
    (sum, debate) => sum + totalVotes(debate.votes),
    0,
  )
  const verifiedCount = debates.filter(
    (debate) => debate.grounding.status === "verified",
  ).length
  const repairedCount = debates.filter(
    (debate) => debate.grounding.status === "repaired",
  ).length
  const limitedCount = debates.filter(
    (debate) => debate.grounding.status === "limited",
  ).length
  const trackedOutcomeCount = debates.filter(
    (debate) => debate.outcomeTracker.status === "tracking",
  ).length
  const averageConfidence = average(
    debates.map((debate) => debate.confidenceScore),
  )
  const reputationScore =
    debates.length * 25 +
    evidenceCount * 3 +
    voteCount * 5 +
    verifiedCount * 10 +
    trackedOutcomeCount * 5

  return {
    debateCount: debates.length,
    evidenceCount,
    voteCount,
    averageConfidence,
    verifiedCount,
    repairedCount,
    limitedCount,
    trackedOutcomeCount,
    reputationScore,
  }
}

export function buildAssetLeaderboard(debates: DebateResult[]) {
  const byAsset = new Map<string, AssetLeaderboardRow>()

  for (const debate of debates) {
    const symbols = debate.assetSymbols.length
      ? debate.assetSymbols
      : ["Market-wide"]

    for (const symbol of symbols) {
      const key = symbol.toUpperCase()
      const current =
        byAsset.get(key) ??
        ({
          symbol: key,
          debates: 0,
          votes: { ...emptyVotes },
          totalVotes: 0,
          leader: "draw",
          leaderShare: 0,
          latestDebateAt: debate.generatedAt,
        } satisfies AssetLeaderboardRow)

      current.debates += 1
      current.votes.bull += debate.votes.bull
      current.votes.bear += debate.votes.bear
      current.votes.draw += debate.votes.draw
      current.totalVotes = totalVotes(current.votes)

      if (Date.parse(debate.generatedAt) > Date.parse(current.latestDebateAt)) {
        current.latestDebateAt = debate.generatedAt
      }

      const leader = leadingSide(current.votes)
      current.leader = leader
      current.leaderShare = current.totalVotes
        ? current.votes[leader] / current.totalVotes
        : 0

      byAsset.set(key, current)
    }
  }

  return Array.from(byAsset.values()).sort((a, b) => {
    return (
      b.totalVotes - a.totalVotes ||
      b.debates - a.debates ||
      Date.parse(b.latestDebateAt) - Date.parse(a.latestDebateAt)
    )
  })
}

export function buildDebateLeaderboard(
  debates: DebateResult[],
  limit = 8,
): DebateLeaderboardRow[] {
  return debates
    .map((debate) => {
      const voteCount = totalVotes(debate.votes)
      const evidenceCount = debate.evidence.length

      return {
        id: debate.id,
        thesis: debate.thesis,
        title: debate.title,
        generatedAt: debate.generatedAt,
        winnerLean: debate.winnerLean,
        confidenceScore: debate.confidenceScore,
        evidenceCount,
        voteCount,
        groundingStatus: debate.grounding.status,
        score:
          debate.confidenceScore +
          evidenceCount * 2 +
          voteCount * 5 +
          groundingBonus(debate.grounding.status),
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
