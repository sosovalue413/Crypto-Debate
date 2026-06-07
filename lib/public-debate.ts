import type { DebateResult, EvidencePoint } from "@/lib/types"

function rawShape(value: unknown) {
  if (Array.isArray(value)) {
    const first = value.find((item) => item && typeof item === "object")

    return {
      type: "array",
      rows: value.length,
      fields:
        first && typeof first === "object"
          ? Object.keys(first).slice(0, 12)
          : [],
    }
  }

  if (value && typeof value === "object") {
    return {
      type: "object",
      fields: Object.keys(value).slice(0, 12),
    }
  }

  return {
    type: value === null ? "null" : typeof value,
  }
}

function redactEvidenceRaw(evidence: EvidencePoint): EvidencePoint {
  return {
    ...evidence,
    raw: {
      redacted: true,
      reason:
        "Raw provider payloads are kept server-side; public responses expose summaries and field shape only.",
      shape: rawShape(evidence.raw),
    },
  }
}

export function toPublicDebate(debate: DebateResult): DebateResult {
  return {
    ...debate,
    evidence: debate.evidence.map(redactEvidenceRaw),
  }
}

export function toPublicDebates(debates: DebateResult[]) {
  return debates.map(toPublicDebate)
}
