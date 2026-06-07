import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"
import type {
  AssetVoteHistory,
  DebateResult,
  DebateSide,
  DebateVotes,
} from "@/lib/types"

const emptyVotes: DebateVotes = {
  bull: 0,
  bear: 0,
  draw: 0,
}

type StoredState = {
  debates: Record<string, DebateResult>
  ballots: Record<string, Record<string, DebateSide>>
}

const memoryState: StoredState = {
  debates: {},
  ballots: {},
}

function redisConfig() {
  const url =
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? ""
  const token =
    process.env.KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    ""

  if (!url || !token) {
    return null
  }

  return {
    url: url.replace(/\/$/, ""),
    token,
    prefix: process.env.CRYPTODEBATE_STORE_PREFIX ?? "cryptodebate",
  }
}

function storePath() {
  return path.join(
    process.cwd(),
    ".data",
    path.basename(
      process.env.CRYPTODEBATE_FILE_STORE_NAME ?? "cryptodebate-store.json",
    ),
  )
}

function normalizeVotes(value: Partial<DebateVotes> | undefined): DebateVotes {
  const normalize = (count: unknown) => {
    const parsed = Number(count ?? 0)

    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
  }

  return {
    bull: normalize(value?.bull),
    bear: normalize(value?.bear),
    draw: normalize(value?.draw),
  }
}

function normalizeDebate(value: unknown): DebateResult | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const debate = value as DebateResult

  if (!debate.id || !debate.thesis || !debate.generatedAt) {
    return null
  }

  return {
    ...debate,
    votes: normalizeVotes(debate.votes),
    decisionBrief: debate.decisionBrief ?? {
      strongestBull: "Stored debate predates the Wave 2 decision brief.",
      strongestBear: "Stored debate predates the Wave 2 decision brief.",
      keyAssumptions: [],
      invalidationSignals: [],
      nextMetricsToWatch: [],
      evidenceGaps: ["Decision brief metadata was not available when this debate was created."],
    },
    outcomeTracker: debate.outcomeTracker ?? {
      status: "insufficient-data",
      baselineAt: debate.generatedAt,
      baselineEvidenceIds: [],
      trackedSymbols: debate.assetSymbols ?? [],
      checkpoints: [],
      notes: ["Stored debate predates Wave 2 outcome tracking metadata."],
    },
    grounding: debate.grounding ?? {
      status: "limited",
      citedEvidenceIds: [],
      repairedSpeechCount: 0,
      unsupportedClaimCount: 0,
      notes: ["Stored debate predates grounding audit metadata."],
    },
  }
}

function votesFromRedis(value: unknown): DebateVotes {
  if (Array.isArray(value)) {
    const record: Record<string, number> = {}

    for (let index = 0; index < value.length; index += 2) {
      record[String(value[index])] = Number(value[index + 1] ?? 0)
    }

    return normalizeVotes(record)
  }

  if (value && typeof value === "object") {
    return normalizeVotes(value as Partial<DebateVotes>)
  }

  return { ...emptyVotes }
}

async function redisCommand<T>(command: unknown[]) {
  const config = redisConfig()

  if (!config) {
    throw new Error("Redis store is not configured.")
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  })
  const payload = (await response.json().catch(() => null)) as
    | { result?: T; error?: string }
    | null

  if (!response.ok || !payload || payload.error) {
    throw new Error(payload?.error ?? `Redis command failed: ${response.status}`)
  }

  return payload.result as T
}

async function redisPipeline(commands: unknown[][]) {
  const config = redisConfig()

  if (!config) {
    throw new Error("Redis store is not configured.")
  }

  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  })
  const payload = (await response.json().catch(() => null)) as
    | Array<{ result?: unknown; error?: string }>
    | null

  if (!response.ok || !payload) {
    throw new Error(`Redis pipeline failed: ${response.status}`)
  }

  const failure = payload.find((item) => item.error)

  if (failure?.error) {
    throw new Error(failure.error)
  }

  return payload.map((item) => item.result)
}

async function readFileState(): Promise<StoredState> {
  try {
    const raw = await readFile(storePath(), "utf8")
    const parsed = JSON.parse(raw) as StoredState
    const debates = Object.fromEntries(
      Object.entries(parsed.debates ?? {}).flatMap(([id, debate]) => {
        const normalized = normalizeDebate(debate)

        return normalized ? [[id, normalized]] : []
      }),
    )

    return {
      debates,
      ballots: parsed.ballots ?? {},
    }
  } catch {
    return memoryState
  }
}

async function writeFileState(state: StoredState) {
  Object.assign(memoryState.debates, state.debates)

  try {
    const filePath = storePath()

    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(state, null, 2))
  } catch {
    return
  }
}

function mergeDebateVotes(debate: DebateResult, votes: DebateVotes) {
  return {
    ...debate,
    votes: normalizeVotes(votes),
  }
}

export function getStoreBackend() {
  return redisConfig() ? "redis" : "file"
}

export async function saveDebate(result: DebateResult) {
  const existing = await getDebate(result.id)
  const debate = mergeDebateVotes(result, existing?.votes ?? result.votes)
  const config = redisConfig()

  if (config) {
    await redisPipeline([
      [
        "HSET",
        `${config.prefix}:debates`,
        debate.id,
        JSON.stringify(debate),
      ],
      [
        "ZADD",
        `${config.prefix}:debate-index`,
        Date.parse(debate.generatedAt),
        debate.id,
      ],
    ])

    return debate
  }

  const state = await readFileState()

  state.debates[debate.id] = debate
  await writeFileState(state)

  return debate
}

export async function getDebate(debateId: string) {
  const config = redisConfig()

  if (config) {
    const [rawDebate, rawVotes] = await redisPipeline([
      ["HGET", `${config.prefix}:debates`, debateId],
      ["HGETALL", `${config.prefix}:votes:${debateId}`],
    ])
    const parsed =
      typeof rawDebate === "string" ? normalizeDebate(JSON.parse(rawDebate)) : null

    return parsed ? mergeDebateVotes(parsed, votesFromRedis(rawVotes)) : null
  }

  const state = await readFileState()

  return normalizeDebate(state.debates[debateId])
}

export async function listDebates(limit = 50) {
  const config = redisConfig()

  if (config) {
    const ids = await redisCommand<string[]>([
      "ZREVRANGE",
      `${config.prefix}:debate-index`,
      0,
      Math.max(limit - 1, 0),
    ])

    if (!ids?.length) {
      return []
    }

    const results = await redisPipeline(
      ids.flatMap((id) => [
        ["HGET", `${config.prefix}:debates`, id],
        ["HGETALL", `${config.prefix}:votes:${id}`],
      ]),
    )

    return ids.flatMap((id, index) => {
      const rawDebate = results[index * 2]
      const rawVotes = results[index * 2 + 1]
      const debate =
        typeof rawDebate === "string"
          ? normalizeDebate(JSON.parse(rawDebate))
          : null

      return debate ? [mergeDebateVotes(debate, votesFromRedis(rawVotes))] : []
    })
  }

  const state = await readFileState()

  return Object.values(state.debates)
    .map(normalizeDebate)
    .filter((debate): debate is DebateResult => Boolean(debate))
    .sort(
      (a, b) =>
        Date.parse(b.generatedAt) - Date.parse(a.generatedAt),
    )
    .slice(0, limit)
}

function normalizeVoterId(voterId: string | undefined) {
  const value = (voterId ?? "").trim()

  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(value)) {
    return null
  }

  return value
}

export async function castVote(input: {
  debateId: string
  vote: DebateSide
  voterId?: string
}) {
  const voterId = normalizeVoterId(input.voterId)

  if (!voterId) {
    throw new Error("A stable voter ID is required.")
  }

  const { debateId, vote } = input
  const existing = await getDebate(debateId)

  if (!existing) {
    return null
  }

  const config = redisConfig()

  if (config) {
    const previousVote = (await redisCommand<string | null>([
      "HGET",
      `${config.prefix}:ballots:${debateId}`,
      voterId,
    ])) as DebateSide | null

    if (previousVote !== vote) {
      const commands: unknown[][] = [
        ["HSET", `${config.prefix}:ballots:${debateId}`, voterId, vote],
        ["HINCRBY", `${config.prefix}:votes:${debateId}`, vote, 1],
      ]

      if (previousVote && ["bull", "bear", "draw"].includes(previousVote)) {
        commands.push([
          "HINCRBY",
          `${config.prefix}:votes:${debateId}`,
          previousVote,
          -1,
        ])
      }

      await redisPipeline(commands)
    }

    const debate = await getDebate(debateId)

    if (debate) {
      await saveDebate(debate)
    }

    return {
      votes: debate?.votes ?? { ...emptyVotes, [vote]: 1 },
      previousVote,
      currentVote: vote,
    }
  }

  const state = await readFileState()
  const debate = normalizeDebate(state.debates[debateId]) ?? existing
  const votes = normalizeVotes(debate?.votes)
  const debateBallots = state.ballots[debateId] ?? {}
  const previousVote = debateBallots[voterId]

  if (previousVote !== vote) {
    if (previousVote) {
      votes[previousVote] = Math.max(0, votes[previousVote] - 1)
    }

    votes[vote] += 1
    debateBallots[voterId] = vote
  }

  state.debates[debateId] = mergeDebateVotes(debate, votes)
  state.ballots[debateId] = debateBallots
  await writeFileState(state)

  return {
    votes,
    previousVote,
    currentVote: vote,
  }
}

export async function getAssetVoteHistory(limit = 100): Promise<AssetVoteHistory[]> {
  const debates = await listDebates(limit)
  const byAsset = new Map<string, AssetVoteHistory>()

  for (const debate of debates) {
    const symbols = debate.assetSymbols.length ? debate.assetSymbols : ["Market-wide"]

    for (const symbol of symbols) {
      const key = symbol.toUpperCase()
      const current =
        byAsset.get(key) ??
        ({
          symbol: key,
          votes: { ...emptyVotes },
          debates: 0,
          latestDebateAt: debate.generatedAt,
        } satisfies AssetVoteHistory)

      current.debates += 1
      current.votes.bull += debate.votes.bull
      current.votes.bear += debate.votes.bear
      current.votes.draw += debate.votes.draw

      if (Date.parse(debate.generatedAt) > Date.parse(current.latestDebateAt)) {
        current.latestDebateAt = debate.generatedAt
      }

      byAsset.set(key, current)
    }
  }

  return Array.from(byAsset.values()).sort((a, b) => {
    const totalDelta = totalVotes(b.votes) - totalVotes(a.votes)

    return totalDelta || b.debates - a.debates
  })
}

function totalVotes(votes: DebateVotes) {
  return votes.bull + votes.bear + votes.draw
}
