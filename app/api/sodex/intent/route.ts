import { NextResponse } from "next/server"
import { getDebate } from "@/lib/debate-store"
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit"
import { buildSodexOrderIntent } from "@/lib/sodex-intent"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const rateLimit = checkRateLimit(request, {
      scope: "sodex-intent",
      limit: 30,
      windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many SoDEX intent requests. Please wait before trying again.",
          retryAfter: rateLimit.retryAfter,
        },
        {
          status: 429,
          headers: rateLimitHeaders(rateLimit),
        },
      )
    }

    const body = (await request.json()) as {
      symbol?: string
      side?: "buy" | "sell"
      amount?: number
      debateId?: string
      walletAddress?: string
    }
    const debate = body.debateId ? await getDebate(body.debateId) : undefined
    const intent = buildSodexOrderIntent({
      symbol: body.symbol ?? "",
      side: body.side === "sell" ? "sell" : "buy",
      amount: Number(body.amount),
      walletAddress: body.walletAddress,
      debate: debate ?? undefined,
    })

    return NextResponse.json({ intent })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 })
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to build SoDEX order intent.",
      },
      { status: 400 },
    )
  }
}
