import { NextResponse } from "next/server"
import { getFeaturedSosoTopic, SosoConfigError } from "@/lib/sosovalue"

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
            : error instanceof Error
              ? error.message
              : "Unable to load featured debate.",
      },
      { status: 200 },
    )
  }
}
