import { NextResponse } from "next/server"
import {
  getAssetVoteHistory,
  getStoreBackend,
  listDebates,
} from "@/lib/debate-store"
import { toPublicDebates } from "@/lib/public-debate"
import { boundedInteger } from "@/lib/server-utils"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const limit = boundedInteger(url.searchParams.get("limit"), 50, 100)
    const archive = await listDebates(limit)
    const assetVotes = await getAssetVoteHistory(100)

    return NextResponse.json({
      archive: toPublicDebates(archive),
      assetVotes,
      storage: getStoreBackend(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        archive: [],
        assetVotes: [],
        storage: getStoreBackend(),
        error:
          error instanceof Error ? error.message : "Unable to load archive.",
      },
      { status: 500 },
    )
  }
}
