import { NextResponse } from "next/server"
import { getSodexEndpoint, getSodexMarkets } from "@/lib/sodex"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const symbols = url.searchParams
    .get("symbols")
    ?.split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean)

  try {
    const markets = await getSodexMarkets(symbols)

    return NextResponse.json({
      endpoint: getSodexEndpoint(),
      markets,
      status: "live",
    })
  } catch (error) {
    return NextResponse.json(
      {
        endpoint: getSodexEndpoint(),
        markets: [],
        status: "error",
        error:
          error instanceof Error ? error.message : "Unable to load SoDEX data.",
      },
      { status: 200 },
    )
  }
}
