import { collectSodexEvidence } from "@/lib/sodex"
import { collectSosoEvidence, SosoConfigError } from "@/lib/sosovalue"
import {
  generateEvidenceFallback,
  generateOpenAiDebate,
  OpenAiConfigError,
} from "@/lib/openai-debate"
import { stableId } from "@/lib/server-utils"
import type { DebateResult, DebateVotes } from "@/lib/types"

const emptyVotes: DebateVotes = {
  bull: 0,
  bear: 0,
  draw: 0,
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

  const generatedAt = new Date().toISOString()

  return {
    id: stableId(`${thesis}-${generatedAt}-${mode}`),
    thesis,
    mode,
    generatedAt,
    engine,
    evidence,
    votes: { ...emptyVotes },
    dataHealth: {
      sosoValue: sosoStatus,
      soDex: sodexStatus,
      openAi: openAiStatus,
      notes,
    },
    ...generated,
  } satisfies DebateResult
}
