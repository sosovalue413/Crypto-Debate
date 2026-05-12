export type DebateSide = "bull" | "bear" | "draw"

export type EvidenceKind =
  | "market"
  | "flow"
  | "news"
  | "dex"
  | "technical"
  | "macro"

export type EvidencePoint = {
  id: string
  kind: EvidenceKind
  title: string
  summary: string
  value: string
  trend: "up" | "down" | "flat" | "mixed"
  source: "SoSoValue" | "SoDEX"
  sourceUrl: string
  asOf: string
  symbol?: string
  raw: unknown
  series?: Array<{
    label: string
    value: number
  }>
}

export type DebateSpeech = {
  argument: string
  evidenceIds: string[]
}

export type DebateRound = {
  round: number
  label: string
  bull: DebateSpeech
  bear: DebateSpeech
}

export type QuickVerdict = {
  bullLine: string
  bearLine: string
  verdict: string
  confidence: "Low" | "Medium" | "High"
}

export type DebateVotes = {
  bull: number
  bear: number
  draw: number
}

export type DebateResult = {
  id: string
  thesis: string
  mode: "full" | "quick"
  title: string
  assetSymbols: string[]
  generatedAt: string
  engine: "openai" | "evidence-fallback"
  evidence: EvidencePoint[]
  rounds: DebateRound[]
  quickVerdict: QuickVerdict
  balancedConclusion: string
  winnerLean: "Bull" | "Bear" | "Draw"
  confidenceScore: number
  votes: DebateVotes
  dataHealth: {
    sosoValue: "live" | "missing-key" | "error"
    soDex: "live" | "error"
    openAi: "live" | "missing-key" | "error"
    notes: string[]
  }
}

export type SodexMarket = {
  symbol: string
  lastPrice?: string
  priceChangePercent?: string
  quoteVolume?: string
  raw: unknown
}
