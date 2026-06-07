import type {
  DebateGrounding,
  DebateResult,
  DebateRound,
  EvidencePoint,
} from "@/lib/types"
import { clamp } from "@/lib/server-utils"

type AiPayload = {
  title: string
  assetSymbols: string[]
  rounds: DebateRound[]
  quickVerdict: DebateResult["quickVerdict"]
  decisionBrief?: DebateResult["decisionBrief"]
  balancedConclusion: string
  winnerLean: DebateResult["winnerLean"]
  confidenceScore: number
}

type GeneratedDebate = Omit<
  DebateResult,
  | "id"
  | "thesis"
  | "mode"
  | "generatedAt"
  | "engine"
  | "evidence"
  | "votes"
  | "grounding"
  | "outcomeTracker"
  | "dataHealth"
>

export class OpenAiConfigError extends Error {
  constructor() {
    super("OPENAI_API_KEY is missing")
  }
}

function outputText(payload: Record<string, unknown>) {
  const chunks: string[] = []
  const output = Array.isArray(payload.output) ? payload.output : []

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue
    }

    const content = Array.isArray((item as { content?: unknown }).content)
      ? ((item as { content: unknown[] }).content)
      : []

    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        chunks.push((part as { text: string }).text)
      }
    }
  }

  return chunks.join("\n").trim()
}

function parseJsonText(text: string) {
  const trimmed = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim()

  return JSON.parse(trimmed) as AiPayload
}

function dataClaimTokens(text: string) {
  const matches =
    text.match(/[$+-]?\d[\d,.]*(?:\.\d+)?\s?(?:%|k|m|b|t|bn|mn)?/gi) ?? []

  return matches
    .map((token) =>
      token
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[,+$]/g, "")
        .replace(/\.0+(?=%|k|m|b|t|bn|mn|$)/g, ""),
    )
    .filter((token) => /[%kmbt]|bn|mn|\d{4,}/i.test(token))
}

function hasToken(haystack: string, token: string) {
  const normalized = haystack
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[,+$]/g, "")

  return normalized.includes(token)
}

function normalizedWords(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const factualClaimTerms = [
  "airdrop",
  "approval",
  "approved",
  "acquisition",
  "bankruptcy",
  "burn",
  "delisting",
  "etf approval",
  "exploit",
  "hack",
  "lawsuit",
  "listing",
  "mainnet",
  "partnership",
  "regulation",
  "settlement",
  "token unlock",
  "treasury purchase",
  "upgrade",
]

function allowedEvidenceText(thesis: string, citedEvidence: EvidencePoint[]) {
  return [
    thesis,
    ...citedEvidence.flatMap((item) => [
      item.title,
      item.summary,
      item.value,
      item.symbol ?? "",
      item.source,
      item.asOf,
    ]),
  ].join(" ")
}

function unsupportedDataClaims(
  text: string,
  thesis: string,
  citedEvidence: EvidencePoint[],
) {
  const allowedText = allowedEvidenceText(thesis, citedEvidence)

  return dataClaimTokens(text).filter((token) => !hasToken(allowedText, token))
}

function unsupportedFactualClaims(
  text: string,
  thesis: string,
  citedEvidence: EvidencePoint[],
) {
  const normalizedText = normalizedWords(text)
  const allowedText = normalizedWords(allowedEvidenceText(thesis, citedEvidence))

  return factualClaimTerms.filter(
    (term) => normalizedText.includes(term) && !allowedText.includes(term),
  )
}

function chooseEvidenceForSide(side: "bull" | "bear", evidence: EvidencePoint[]) {
  const trendMatches =
    side === "bull"
      ? evidence.filter((item) => item.trend === "up" || item.trend === "mixed")
      : evidence.filter((item) => item.trend === "down" || item.trend === "mixed")
  const neutral = evidence.filter((item) => item.trend === "flat")

  return [...trendMatches, ...neutral, ...evidence].slice(0, 3)
}

function repairedArgument(side: "bull" | "bear", evidence: EvidencePoint[]) {
  if (!evidence.length) {
    return side === "bull"
      ? "Bull case: live evidence is too thin for a high-conviction upside claim."
      : "Bear case: missing live evidence is itself a reason to keep risk controls tight."
  }

  const evidenceText = evidence
    .slice(0, 3)
    .map((item) => `${item.title}: ${item.summary}`)
    .join(" ")

  return side === "bull"
    ? `Bull case: the constructive argument must rest on the cited live cards. ${evidenceText}`
    : `Bear case: the risk argument must rest on the cited live cards. ${evidenceText}`
}

function stringList(value: unknown, limit: number, fallback: string[]) {
  const items = Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : []

  return (items.length ? items : fallback).slice(0, limit)
}

function evidenceTitles(evidence: EvidencePoint[], limit = 3) {
  return evidence
    .slice(0, limit)
    .map((item) => item.title)
    .join(", ")
}

function fallbackDecisionBrief(evidence: EvidencePoint[]): DebateResult["decisionBrief"] {
  const upside = chooseEvidenceForSide("bull", evidence)
  const downside = chooseEvidenceForSide("bear", evidence)

  return {
    strongestBull: upside.length
      ? `The strongest constructive case is anchored to ${evidenceTitles(upside)}.`
      : "The constructive case is weak until more live evidence is available.",
    strongestBear: downside.length
      ? `The strongest risk case is anchored to ${evidenceTitles(downside)}.`
      : "The risk case is mainly uncertainty from limited live confirmation.",
    keyAssumptions: [
      "The cited market, flow, index, news, and SoDEX context remains directionally valid after the debate.",
      "The thesis horizon is long enough for noisy short-term data to resolve.",
      "Liquidity is sufficient before any execution workflow is considered.",
    ],
    invalidationSignals: [
      "The strongest cited evidence reverses for multiple sessions.",
      "ETF or index context diverges from the thesis direction.",
      "SoDEX liquidity context becomes too thin for the intended action.",
    ],
    nextMetricsToWatch: [
      "24h and 30D price path",
      "ETF net flow where available",
      "SoDEX quote volume and spread context",
    ],
    evidenceGaps: evidence.length
      ? ["No wallet/account execution data is used in this research-only view."]
      : ["Live evidence collection failed or returned too little data."],
  }
}

function sanitize(payload: AiPayload, evidence: EvidencePoint[]): GeneratedDebate {
  const evidenceIds = new Set(evidence.map((item) => item.id))
  const keepIds = (ids: string[] | undefined) =>
    (ids ?? []).filter((id) => evidenceIds.has(id)).slice(0, 4)

  return {
    title: String(payload.title ?? "CryptoDebate"),
    assetSymbols: Array.isArray(payload.assetSymbols)
      ? payload.assetSymbols.map(String).slice(0, 6)
      : [],
    rounds: (payload.rounds ?? []).slice(0, 3).map((round, index) => ({
      round: Number(round.round ?? index + 1),
      label: String(round.label ?? ["Opening", "Rebuttal", "Closing"][index]),
      bull: {
        argument: String(round.bull?.argument ?? ""),
        evidenceIds: keepIds(round.bull?.evidenceIds),
      },
      bear: {
        argument: String(round.bear?.argument ?? ""),
        evidenceIds: keepIds(round.bear?.evidenceIds),
      },
    })),
    quickVerdict: {
      bullLine: String(payload.quickVerdict?.bullLine ?? ""),
      bearLine: String(payload.quickVerdict?.bearLine ?? ""),
      verdict: String(payload.quickVerdict?.verdict ?? ""),
      confidence: ["Low", "Medium", "High"].includes(
        payload.quickVerdict?.confidence,
      )
        ? payload.quickVerdict.confidence
        : "Medium",
    },
    decisionBrief: {
      strongestBull: String(
        payload.decisionBrief?.strongestBull ??
          fallbackDecisionBrief(evidence).strongestBull,
      ),
      strongestBear: String(
        payload.decisionBrief?.strongestBear ??
          fallbackDecisionBrief(evidence).strongestBear,
      ),
      keyAssumptions: stringList(
        payload.decisionBrief?.keyAssumptions,
        4,
        fallbackDecisionBrief(evidence).keyAssumptions,
      ),
      invalidationSignals: stringList(
        payload.decisionBrief?.invalidationSignals,
        4,
        fallbackDecisionBrief(evidence).invalidationSignals,
      ),
      nextMetricsToWatch: stringList(
        payload.decisionBrief?.nextMetricsToWatch,
        4,
        fallbackDecisionBrief(evidence).nextMetricsToWatch,
      ),
      evidenceGaps: stringList(
        payload.decisionBrief?.evidenceGaps,
        4,
        fallbackDecisionBrief(evidence).evidenceGaps,
      ),
    },
    balancedConclusion: String(payload.balancedConclusion ?? ""),
    winnerLean: ["Bull", "Bear", "Draw"].includes(payload.winnerLean)
      ? payload.winnerLean
      : "Draw",
    confidenceScore: clamp(Number(payload.confidenceScore ?? 60), 1, 100),
  }
}

export function groundGeneratedDebate(
  payload: GeneratedDebate,
  input: {
    thesis: string
    mode: "full" | "quick"
    evidence: EvidencePoint[]
  },
): GeneratedDebate & { grounding: DebateGrounding } {
  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]))
  const notes = new Set<string>()
  let repairedSpeechCount = 0
  let unsupportedClaimCount = 0

  const repairSpeech = (
    speech: DebateRound["bull"],
    side: "bull" | "bear",
  ) => {
    let evidenceIds = speech.evidenceIds
      .filter((id) => evidenceById.has(id))
      .slice(0, 4)
    let citedEvidence = evidenceIds
      .map((id) => evidenceById.get(id))
      .filter(Boolean) as EvidencePoint[]
    const unsupportedNumbers = unsupportedDataClaims(
      speech.argument,
      input.thesis,
      citedEvidence,
    )
    const unsupportedFacts = unsupportedFactualClaims(
      speech.argument,
      input.thesis,
      citedEvidence,
    )
    const unsupported = [...unsupportedNumbers, ...unsupportedFacts]
    unsupportedClaimCount += unsupported.length

    if (!evidenceIds.length && input.evidence.length) {
      citedEvidence = chooseEvidenceForSide(side, input.evidence)
      evidenceIds = citedEvidence.map((item) => item.id)
      repairedSpeechCount += 1
      notes.add(`${side} speech received fallback evidence because no valid citation IDs were returned.`)
    }

    if (unsupported.length) {
      repairedSpeechCount += 1
      notes.add(`${side} speech was rewritten after unsupported data or event claims were detected.`)

      return {
        argument: repairedArgument(side, citedEvidence),
        evidenceIds,
      }
    }

    return {
      argument: speech.argument.trim() || repairedArgument(side, citedEvidence),
      evidenceIds,
    }
  }

  const requestedRounds = input.mode === "quick" ? 1 : 3
  const decisionBriefText = [
    payload.decisionBrief.strongestBull,
    payload.decisionBrief.strongestBear,
    ...payload.decisionBrief.keyAssumptions,
    ...payload.decisionBrief.invalidationSignals,
    ...payload.decisionBrief.nextMetricsToWatch,
    ...payload.decisionBrief.evidenceGaps,
  ].join(" ")
  const briefUnsupported = [
    ...unsupportedDataClaims(
      decisionBriefText,
      input.thesis,
      input.evidence,
    ),
    ...unsupportedFactualClaims(
      decisionBriefText,
      input.thesis,
      input.evidence,
    ),
  ]
  const sourceRounds = payload.rounds.length
    ? payload.rounds
    : generateEvidenceFallback({
        thesis: input.thesis,
        mode: input.mode,
        evidence: input.evidence,
        assetSymbols: payload.assetSymbols,
      }).rounds
  const rounds = sourceRounds.slice(0, requestedRounds).map((round, index) => ({
    round: index + 1,
    label: round.label || ["Opening", "Rebuttal", "Closing"][index] || "Round",
    bull: repairSpeech(round.bull, "bull"),
    bear: repairSpeech(round.bear, "bear"),
  }))
  const citedEvidenceIds = Array.from(
    new Set(
      rounds.flatMap((round) => [
        ...round.bull.evidenceIds,
        ...round.bear.evidenceIds,
      ]),
    ),
  )
  const status: DebateGrounding["status"] = !input.evidence.length
    ? "limited"
    : repairedSpeechCount || briefUnsupported.length
      ? "repaired"
      : "verified"

  if (status === "verified") {
    notes.add("Every retained citation ID maps to a live evidence card.")
  }

  if (status === "limited") {
    notes.add("Live evidence was limited, so the debate is marked low-confidence.")
  }

  if (briefUnsupported.length) {
    notes.add("Decision brief was rebuilt after unsupported data or event claims were detected.")
  }

  return {
    ...payload,
    rounds,
    decisionBrief: briefUnsupported.length
      ? fallbackDecisionBrief(input.evidence)
      : payload.decisionBrief,
    grounding: {
      status,
      citedEvidenceIds,
      repairedSpeechCount,
      unsupportedClaimCount: unsupportedClaimCount + briefUnsupported.length,
      notes: Array.from(notes),
    },
  }
}

export async function generateOpenAiDebate(input: {
  thesis: string
  mode: "full" | "quick"
  evidence: EvidencePoint[]
  assetSymbols: string[]
}) {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new OpenAiConfigError()
  }

  const evidenceForPrompt = input.evidence.map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    value: item.value,
    trend: item.trend,
    source: item.source,
    asOf: item.asOf,
    symbol: item.symbol,
  }))

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
      instructions:
        "You are CryptoDebate, a market debate engine. Create a sharp but balanced crypto thesis debate. Use only the provided evidence IDs for concrete data claims. Every Bull and Bear speech must cite 1-4 valid evidenceIds. Make Bull and Bear genuinely adversarial: each side must address the strongest point from the other side, not repeat generic talking points. Do not invent numbers, sources, partnerships, prices, flows, or execution status. Do not mention a numeric market claim unless it appears in the thesis or in a cited evidence summary/value. If the evidence is thin, explicitly state uncertainty. This is research support, not financial advice.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Return one valid JSON object only. Do not wrap it in markdown.\n" +
                JSON.stringify({
                  thesis: input.thesis,
                  mode: input.mode,
                  requestedRounds: input.mode === "quick" ? 1 : 3,
                  assetSymbols: input.assetSymbols,
                  evidence: evidenceForPrompt,
                  outputContract: {
                    title: "short debate title",
                    assetSymbols: ["symbols discussed"],
                    rounds:
                      "array of 1 or 3 rounds, each with round, label, bull.argument, bull.evidenceIds, bear.argument, bear.evidenceIds",
                    quickVerdict: {
                      bullLine: "one line",
                      bearLine: "one line",
                      verdict: "balanced verdict",
                      confidence: "Low | Medium | High",
                    },
                    decisionBrief: {
                      strongestBull: "single strongest evidence-backed bull point",
                      strongestBear: "single strongest evidence-backed bear point",
                      keyAssumptions: ["assumptions that must hold"],
                      invalidationSignals: ["what would break the thesis"],
                      nextMetricsToWatch: ["specific metrics to monitor next"],
                      evidenceGaps: ["missing evidence that limits confidence"],
                    },
                    balancedConclusion: "short neutral synthesis",
                    winnerLean: "Bull | Bear | Draw",
                    confidenceScore: "1-100 integer",
                  },
                }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_object",
        },
      },
      max_output_tokens: input.mode === "quick" ? 1600 : 3600,
    }),
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  if (!response.ok || !payload) {
    const message =
      payload && typeof payload.error === "object"
        ? JSON.stringify(payload.error)
        : `OpenAI request failed: ${response.status}`
    throw new Error(message)
  }

  return sanitize(parseJsonText(outputText(payload)), input.evidence)
}

export function generateEvidenceFallback(input: {
  thesis: string
  mode: "full" | "quick"
  evidence: EvidencePoint[]
  assetSymbols: string[]
}) {
  const positive = input.evidence.filter((item) => item.trend === "up")
  const negative = input.evidence.filter((item) => item.trend === "down")
  const mixed = input.evidence.filter(
    (item) => item.trend === "mixed" || item.trend === "flat",
  )
  const bullEvidence = [...positive, ...mixed, ...input.evidence].slice(0, 3)
  const bearEvidence = [...negative, ...mixed, ...input.evidence].slice(0, 3)

  const bullText = bullEvidence.length
    ? `Bull case: ${bullEvidence
        .map((item) => `${item.title} (${item.value})`)
        .join("; ")} supports constructive positioning if the thesis timeline is patient.`
    : "Bull case: live evidence is limited, so conviction should stay modest."
  const bearText = bearEvidence.length
    ? `Bear case: ${bearEvidence
        .map((item) => `${item.title} (${item.value})`)
        .join("; ")} creates enough risk to avoid a one-sided conclusion.`
    : "Bear case: live evidence is limited, and that alone is a risk signal."

  const rounds: DebateRound[] = [
    {
      round: 1,
      label: "Opening",
      bull: {
        argument: bullText,
        evidenceIds: bullEvidence.map((item) => item.id),
      },
      bear: {
        argument: bearText,
        evidenceIds: bearEvidence.map((item) => item.id),
      },
    },
  ]

  if (input.mode === "full") {
    rounds.push(
      {
        round: 2,
        label: "Rebuttal",
        bull: {
          argument:
            "The bull rebuttal is that negative datapoints can be timing noise unless they persist across flows, spot price, and news attention together.",
          evidenceIds: bullEvidence.map((item) => item.id),
        },
        bear: {
          argument:
            "The bear rebuttal is that a thesis needs more than isolated strength; it needs durable demand, cleaner liquidity, and less narrative crowding.",
          evidenceIds: bearEvidence.map((item) => item.id),
        },
      },
      {
        round: 3,
        label: "Closing",
        bull: {
          argument:
            "Bull closing: the thesis is investable only if the strongest live metrics keep improving after this debate.",
          evidenceIds: bullEvidence.map((item) => item.id),
        },
        bear: {
          argument:
            "Bear closing: the better decision may be to wait for confirmation because the current evidence does not remove downside risk.",
          evidenceIds: bearEvidence.map((item) => item.id),
        },
      },
    )
  }

  const winnerLean =
    positive.length > negative.length
      ? "Bull"
      : negative.length > positive.length
        ? "Bear"
        : "Draw"

  return {
    title: input.assetSymbols.length
      ? `${input.assetSymbols.join("/")} thesis debate`
      : "Crypto thesis debate",
    assetSymbols: input.assetSymbols,
    rounds,
    quickVerdict: {
      bullLine:
        bullEvidence[0]?.summary ?? "The bull case needs more live confirmation.",
      bearLine:
        bearEvidence[0]?.summary ?? "The bear case rests on uncertainty and missing confirmation.",
      verdict:
        "Evidence-only fallback produced this verdict because the AI key was not available. The app still used live market/news data for the debate frame.",
      confidence: input.evidence.length >= 5 ? "Medium" : "Low",
    },
    balancedConclusion:
      "Treat this as a balanced research prompt: compare the strongest data-backed point on each side before acting.",
    winnerLean,
    confidenceScore: input.evidence.length >= 5 ? 58 : 42,
    decisionBrief: fallbackDecisionBrief(input.evidence),
  } satisfies Omit<
    DebateResult,
    | "id"
    | "thesis"
    | "mode"
    | "generatedAt"
    | "engine"
    | "evidence"
    | "votes"
    | "grounding"
    | "outcomeTracker"
    | "dataHealth"
  >
}
