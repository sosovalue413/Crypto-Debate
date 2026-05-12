import type { DebateResult, DebateRound, EvidencePoint } from "@/lib/types"
import { clamp } from "@/lib/server-utils"

type AiPayload = {
  title: string
  assetSymbols: string[]
  rounds: DebateRound[]
  quickVerdict: DebateResult["quickVerdict"]
  balancedConclusion: string
  winnerLean: DebateResult["winnerLean"]
  confidenceScore: number
}

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

function sanitize(payload: AiPayload, evidence: EvidencePoint[]): AiPayload {
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
    balancedConclusion: String(payload.balancedConclusion ?? ""),
    winnerLean: ["Bull", "Bear", "Draw"].includes(payload.winnerLean)
      ? payload.winnerLean
      : "Draw",
    confidenceScore: clamp(Number(payload.confidenceScore ?? 60), 1, 100),
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
        "You are CryptoDebate, a market debate engine. Create a sharp but balanced crypto thesis debate. Use only the provided evidence IDs for concrete data claims. Do not invent numbers, sources, partnerships, prices, or flow data. If the evidence is thin, explicitly state uncertainty. This is research support, not financial advice.",
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
  } satisfies Omit<
    DebateResult,
    "id" | "thesis" | "mode" | "generatedAt" | "engine" | "evidence" | "votes" | "dataHealth"
  >
}
