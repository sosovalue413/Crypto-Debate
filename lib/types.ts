export type DebateSide = "bull" | "bear" | "draw"

export type EvidenceKind =
  | "market"
  | "flow"
  | "index"
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
  source: "SoSoValue" | "SoSoValue Indexes" | "SoDEX"
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

export type DebateGrounding = {
  status: "verified" | "repaired" | "limited"
  citedEvidenceIds: string[]
  repairedSpeechCount: number
  unsupportedClaimCount: number
  notes: string[]
}

export type DecisionBrief = {
  strongestBull: string
  strongestBear: string
  keyAssumptions: string[]
  invalidationSignals: string[]
  nextMetricsToWatch: string[]
  evidenceGaps: string[]
}

export type OutcomeCheckpoint = {
  label: string
  dueAt: string
  status: "pending" | "ready"
}

export type OutcomeTracker = {
  status: "tracking" | "insufficient-data"
  baselineAt: string
  baselineEvidenceIds: string[]
  trackedSymbols: string[]
  checkpoints: OutcomeCheckpoint[]
  notes: string[]
}

export type AssetVoteHistory = {
  symbol: string
  votes: DebateVotes
  debates: number
  latestDebateAt: string
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
  decisionBrief: DecisionBrief
  outcomeTracker: OutcomeTracker
  balancedConclusion: string
  winnerLean: "Bull" | "Bear" | "Draw"
  confidenceScore: number
  votes: DebateVotes
  grounding: DebateGrounding
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

export type SodexOrderIntent = {
  venue: "SoDEX spot"
  status: "unsigned-preview"
  endpoint: string
  docsUrl: string
  symbol: string
  side: "buy" | "sell"
  inputSize: number
  inputUnit: "USDC" | "base"
  walletAddress?: string
  sourceDebateId?: string
  clientOrderId: string
  riskContext?: {
    winnerLean?: DebateResult["winnerLean"]
    confidenceScore?: number
    evidenceIds: string[]
  }
  order: {
    type: "MARKET"
    timeInForce: "IOC"
    symbol: string
    side: "BUY" | "SELL"
    funds?: string
    quantity?: string
  }
  request: {
    method: "POST"
    path: "/trade/orders/batch"
    body: {
      accountID: string
      orders: Array<{
        clOrdID: string
        symbol: string
        side: "BUY" | "SELL"
        type: "MARKET"
        timeInForce: "IOC"
        funds?: string
        quantity?: string
      }>
    }
    unresolved: string[]
  }
  signing: {
    scheme: "EIP-712 ExchangeAction"
    domain: {
      name: "spot"
      version: "1"
      chainId: 138565 | 286623
      verifyingContract: "0x0000000000000000000000000000000000000000"
    }
    submitPath: "/trade/orders/batch"
    requiredHeaders: ["X-API-Sign", "X-API-Nonce"]
    optionalHeaders: ["X-API-Key"]
    nonce: {
      recommended: string
      rule: string
    }
    apiKeyHeader: string
  }
  readiness: {
    canSubmit: boolean
    missing: string[]
    nextSteps: string[]
  }
  createdAt: string
}
