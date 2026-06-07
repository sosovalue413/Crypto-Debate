import { NextResponse } from "next/server"
import { getStoreBackend, listDebates } from "@/lib/debate-store"
import { getSodexMarkets } from "@/lib/sodex"

export const runtime = "nodejs"

type Check = {
  ok: boolean
  message?: string
  count?: number
}

function configured(value: string | undefined) {
  return Boolean(value?.trim())
}

async function archiveCheck(): Promise<Check> {
  try {
    const debates = await listDebates(1)

    return {
      ok: true,
      count: debates.length,
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to read archive.",
    }
  }
}

async function sodexCheck(): Promise<Check> {
  try {
    const markets = await getSodexMarkets()

    return {
      ok: markets.length > 0,
      count: markets.length,
      message: markets.length ? undefined : "SoDEX returned no markets.",
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to read SoDEX markets.",
    }
  }
}

export async function GET() {
  const startedAt = Date.now()
  const [archive, sodex] = await Promise.all([archiveCheck(), sodexCheck()])
  const requiredConfig = {
    openAi: configured(process.env.OPENAI_API_KEY),
    sosoValue: configured(process.env.SOSOVALUE_API_KEY),
  }
  const persistenceConfig = {
    blob: configured(process.env.BLOB_READ_WRITE_TOKEN),
    redis:
      configured(process.env.KV_REST_API_URL) &&
      configured(process.env.KV_REST_API_TOKEN),
    upstash:
      configured(process.env.UPSTASH_REDIS_REST_URL) &&
      configured(process.env.UPSTASH_REDIS_REST_TOKEN),
  }
  const sodexSigningConfig = {
    accountId: configured(process.env.SODEX_ACCOUNT_ID),
    verifyingContract: configured(process.env.SODEX_EIP712_VERIFYING_CONTRACT),
  }
  const ok =
    archive.ok &&
    sodex.ok &&
    requiredConfig.openAi &&
    requiredConfig.sosoValue &&
    (persistenceConfig.blob ||
      persistenceConfig.redis ||
      persistenceConfig.upstash ||
      getStoreBackend() === "file")

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      storage: getStoreBackend(),
      config: {
        required: requiredConfig,
        persistence: persistenceConfig,
        sodexSigning: sodexSigningConfig,
      },
      checks: {
        archive,
        sodex,
      },
    },
    {
      status: ok ? 200 : 503,
      headers: {
        "cache-control": "no-store",
      },
    },
  )
}
