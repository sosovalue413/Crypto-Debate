import { NextResponse } from "next/server"
import type { DebateSide, DebateVotes } from "@/lib/types"

export const runtime = "nodejs"

const store = globalThis as typeof globalThis & {
  cryptoDebateVotes?: Map<string, DebateVotes>
}

const votes = store.cryptoDebateVotes ?? new Map<string, DebateVotes>()
store.cryptoDebateVotes = votes

export async function POST(request: Request) {
  const body = (await request.json()) as {
    debateId?: string
    vote?: DebateSide
  }

  if (!body.debateId || !["bull", "bear", "draw"].includes(body.vote ?? "")) {
    return NextResponse.json({ error: "Invalid vote payload." }, { status: 400 })
  }

  const current = votes.get(body.debateId) ?? {
    bull: 0,
    bear: 0,
    draw: 0,
  }

  current[body.vote as DebateSide] += 1
  votes.set(body.debateId, current)

  return NextResponse.json({ votes: current })
}
