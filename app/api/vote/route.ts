import { NextResponse } from "next/server"
import {
  castVote,
  getAssetVoteHistory,
  getStoreBackend,
} from "@/lib/debate-store"
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit"
import type { DebateSide } from "@/lib/types"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const rateLimit = checkRateLimit(request, {
      scope: "vote",
      limit: 60,
      windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many vote requests. Please wait before trying again.",
          retryAfter: rateLimit.retryAfter,
        },
        {
          status: 429,
          headers: rateLimitHeaders(rateLimit),
        },
      )
    }

    const body = (await request.json()) as {
      debateId?: string
      vote?: DebateSide
      voterId?: string
    }

    if (!body.debateId || !["bull", "bear", "draw"].includes(body.vote ?? "")) {
      return NextResponse.json({ error: "Invalid vote payload." }, { status: 400 })
    }

    const receipt = await castVote({
      debateId: body.debateId,
      vote: body.vote as DebateSide,
      voterId: body.voterId,
    }).catch((error) => {
      if (error instanceof Error && error.message.includes("voter ID")) {
        return "invalid-voter" as const
      }

      throw error
    })

    if (receipt === "invalid-voter") {
      return NextResponse.json({ error: "Invalid voter ID." }, { status: 400 })
    }

    if (!receipt) {
      return NextResponse.json({ error: "Debate not found." }, { status: 404 })
    }

    const assetVotes = await getAssetVoteHistory()

    return NextResponse.json({
      votes: receipt.votes,
      previousVote: receipt.previousVote,
      currentVote: receipt.currentVote,
      assetVotes,
      storage: getStoreBackend(),
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 })
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to record vote.",
      },
      { status: 500 },
    )
  }
}
