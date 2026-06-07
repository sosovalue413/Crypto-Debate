import { NextResponse } from "next/server"
import { runDebate } from "@/lib/debate-engine"
import { saveDebate } from "@/lib/debate-store"
import { toPublicDebate } from "@/lib/public-debate"
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit"
import { SosoConfigError, SosoRateLimitError } from "@/lib/sosovalue"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const rateLimit = checkRateLimit(request, {
      scope: "debate",
      limit: 5,
      windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many debate requests. Please wait before trying again.",
          retryAfter: rateLimit.retryAfter,
        },
        {
          status: 429,
          headers: rateLimitHeaders(rateLimit),
        },
      )
    }

    const body = (await request.json()) as {
      thesis?: string
      mode?: "full" | "quick"
    }
    const thesis = body.thesis?.trim()

    if (!thesis || thesis.length < 8) {
      return NextResponse.json(
        { error: "Enter a crypto thesis with at least 8 characters." },
        { status: 400 },
      )
    }

    const result = await runDebate(
      thesis.slice(0, 500),
      body.mode === "quick" ? "quick" : "full",
    )
    const stored = await saveDebate(result)

    return NextResponse.json(toPublicDebate(stored))
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 })
    }

    if (error instanceof SosoConfigError) {
      return NextResponse.json(
        {
          error:
            "SOSOVALUE_API_KEY is required for live evidence. Add it to .env.local and restart the dev server.",
          code: "MISSING_SOSOVALUE_API_KEY",
        },
        { status: 500 },
      )
    }

    if (error instanceof SosoRateLimitError) {
      return NextResponse.json(
        {
          error:
            "SoSoValue is rate-limited right now. Please retry shortly; cached evidence will be used automatically when available.",
          code: "SOSOVALUE_RATE_LIMIT",
          provider: "sosovalue",
          retryAfter: error.retryAfter,
        },
        {
          status: 429,
          headers: {
            "retry-after": String(error.retryAfter),
          },
        },
      )
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to generate debate.",
      },
      { status: 500 },
    )
  }
}
