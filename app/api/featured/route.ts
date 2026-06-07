import { NextResponse } from "next/server"
import {
  getFeaturedSosoTopic,
  SosoConfigError,
  SosoRateLimitError,
} from "@/lib/sosovalue"

export const runtime = "nodejs"

export async function GET() {
  try {
    const topic = await getFeaturedSosoTopic()

    return NextResponse.json({ topic })
  } catch (error) {
    return NextResponse.json(
      {
        topic: null,
        error:
          error instanceof SosoConfigError
            ? "SOSOVALUE_API_KEY is missing."
            : error instanceof SosoRateLimitError
              ? "SoSoValue is rate-limited right now."
            : error instanceof Error
              ? error.message
              : "Unable to load featured debate.",
        retryAfter:
          error instanceof SosoRateLimitError ? error.retryAfter : undefined,
      },
      { status: 200 },
    )
  }
}
