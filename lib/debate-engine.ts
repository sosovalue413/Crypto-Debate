import { collectSodexEvidence } from "@/lib/sodex"
import { collectSosoEvidence, SosoConfigError } from "@/lib/sosovalue"
import {
  generateEvidenceFallback,
  generateOpenAiDebate,
  groundGeneratedDebate,
  OpenAiConfigError,
} from "@/lib/openai-debate"
import { stableId } from "@/lib/server-utils"
import type { DebateResult, DebateVotes, EvidencePoint } from "@/lib/types"

const emptyVotes: DebateVotes = {
  bull: 0,
  bear: 0,
  draw: 0,
}

function addDays(date: Date, days: number) {
  const next = new Date(date)

  next.setDate(next.getDate() + days)

  return next.toISOString()
}

function buildOutcomeTracker(input: {
  generatedAt: string
  evidence: EvidencePoint[]
  assetSymbols: string[]
}): DebateResult["outcomeTracker"] {
  const baselineEvidence = input.evidence
    .filter((item) =>
      ["market", "technical", "flow", "index", "dex"].includes(item.kind),
    )
    .slice(0, 5)
  const baselineAt = input.generatedAt
  const start = new Date(baselineAt)

  if (!baselineEvidence.length) {
    return {
      status: "insufficient-data",
      baselineAt,
      baselineEvidenceIds: [],
      trackedSymbols: input.assetSymbols,
      checkpoints: [],
      notes: ["Outcome tracking needs at least one market, flow, index, or SoDEX evidence card."],
    }
  }

  return {
    status: "tracking",
    baselineAt,
    baselineEvidenceIds: baselineEvidence.map((item) => item.id),
    trackedSymbols: input.assetSymbols.length ? input.assetSymbols : ["Market-wide"],
    checkpoints: [
      {
        label: "7D check",
        dueAt: addDays(start, 7),
        status: "pending",
      },
      {
        label: "30D check",
        dueAt: addDays(start, 30),
        status: "pending",
      },
      {
        label: "90D check",
        dueAt: addDays(start, 90),
        status: "pending",
      },
    ],
    notes: [
      "Baseline uses only live evidence collected for this debate.",
      "Future checks compare the thesis against the same tracked symbols and evidence families.",
    ],
  }
}

export async function runDebate(thesis: string, mode: "full" | "quick") {
  const notes: string[] = []
  let sosoStatus: DebateResult["dataHealth"]["sosoValue"] = "live"
  let sodexStatus: DebateResult["dataHealth"]["soDex"] = "live"
  let openAiStatus: DebateResult["dataHealth"]["openAi"] = "live"

  let sosoData: Awaited<ReturnType<typeof collectSosoEvidence>>

  try {
    sosoData = await collectSosoEvidence(thesis)
  } catch (error) {
    if (error instanceof SosoConfigError) {
      sosoStatus = "missing-key"
      throw error
    }

    sosoStatus = "error"
    throw error
  }

  const assetSymbols = sosoData.assets.map((asset) => asset.symbol)
  let evidence = sosoData.evidence

  try {
    evidence = [...evidence, ...(await collectSodexEvidence(assetSymbols))]
  } catch (error) {
    sodexStatus = "error"
    notes.push(
      error instanceof Error
        ? `SoDEX public market data failed: ${error.message}`
        : "SoDEX public market data failed.",
    )
  }

  let generated: Omit<
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
  let engine: DebateResult["engine"] = "openai"

  try {
    generated = await generateOpenAiDebate({
      thesis,
      mode,
      evidence,
      assetSymbols,
    })
  } catch (error) {
    engine = "evidence-fallback"
    openAiStatus = error instanceof OpenAiConfigError ? "missing-key" : "error"
    notes.push(
      error instanceof Error
        ? `AI generation used evidence fallback: ${error.message}`
        : "AI generation used evidence fallback.",
    )
    generated = generateEvidenceFallback({
      thesis,
      mode,
      evidence,
      assetSymbols,
    })
  }

  const grounded = groundGeneratedDebate(generated, {
    thesis,
    mode,
    evidence,
  })

  const generatedAt = new Date().toISOString()
  const outcomeTracker = buildOutcomeTracker({
    generatedAt,
    evidence,
    assetSymbols,
  })

  return {
    id: stableId(`${thesis}-${generatedAt}-${mode}`),
    thesis,
    mode,
    generatedAt,
    engine,
    evidence,
    votes: { ...emptyVotes },
    outcomeTracker,
    dataHealth: {
      sosoValue: sosoStatus,
      soDex: sodexStatus,
      openAi: openAiStatus,
      notes,
    },
    ...grounded,
  } satisfies DebateResult
}
