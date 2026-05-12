import { NextResponse } from "next/server"
import { runDebate } from "@/lib/debate-engine"
import { SosoConfigError } from "@/lib/sosovalue"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
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

    return NextResponse.json(result)
  } catch (error) {
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

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to generate debate.",
      },
      { status: 500 },
    )
  }
}
