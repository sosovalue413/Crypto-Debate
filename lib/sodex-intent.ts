import type { DebateResult, SodexOrderIntent } from "@/lib/types"
import { getSodexEndpoint, getSodexSymbolRule } from "@/lib/sodex"
import { stableId } from "@/lib/server-utils"

const SODEX_DOCS_URL =
  "https://sodex.com/documentation/trading-api/rest-v1/sodex-rest-spot-api"

const ORDER_SIDE = {
  BUY: 1,
  SELL: 2,
} as const
const ORDER_TYPE = {
  MARKET: 2,
} as const
const TIME_IN_FORCE = {
  IOC: 3,
} as const

function formatOrderAmount(amount: number) {
  return amount.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 20,
  })
}

function validateWalletAddress(walletAddress: string | undefined) {
  const trimmed = walletAddress?.trim()

  if (!trimmed) {
    return undefined
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    throw new Error("Wallet address must be a valid EVM address.")
  }

  return trimmed
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim()

  return value || null
}

function optionalAccountId() {
  const value = optionalEnv("SODEX_ACCOUNT_ID")

  if (!value) {
    return {
      value: null,
      problem: "SoDEX accountID",
    }
  }

  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    return {
      value: null,
      problem: "valid uint64 SoDEX accountID",
    }
  }

  return {
    value: Number(value),
    problem: null,
  }
}

function optionalVerifyingContract() {
  const value = optionalEnv("SODEX_EIP712_VERIFYING_CONTRACT")

  if (!value) {
    return {
      value: null,
      problem: "EIP-712 verifying contract",
    }
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return {
      value: null,
      problem: "valid EIP-712 verifying contract",
    }
  }

  return {
    value,
    problem: null,
  }
}

function decimalPlaces(value: string) {
  const [, decimal = ""] = value.split(".")

  return decimal.length
}

function precisionProblem(input: {
  amount: string
  symbol: string
  side: "buy" | "sell"
  quoteCoinPrecision?: number
  quantityPrecision?: number
}) {
  const precision =
    input.side === "buy"
      ? input.quoteCoinPrecision
      : input.quantityPrecision

  if (precision === undefined) {
    return null
  }

  if (decimalPlaces(input.amount) > precision) {
    return input.side === "buy"
      ? `funds precision <= ${precision} decimals`
      : `quantity precision <= ${precision} decimals`
  }

  return null
}

function minimumProblem(input: {
  amount: number
  side: "buy" | "sell"
  marketMinQuantity?: string
  minNotional?: string
}) {
  if (input.side === "buy") {
    const minNotional = Number(input.minNotional ?? 0)

    return minNotional > 0 && input.amount < minNotional
      ? `minimum notional ${input.minNotional}`
      : null
  }

  const minQuantity = Number(input.marketMinQuantity ?? 0)

  return minQuantity > 0 && input.amount < minQuantity
    ? `minimum market quantity ${input.marketMinQuantity}`
    : null
}

function compactStrings(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value))
}

export async function buildSodexOrderIntent(input: {
  symbol: string
  side: "buy" | "sell"
  amount: number
  walletAddress?: string
  debate?: Pick<
    DebateResult,
    "id" | "winnerLean" | "confidenceScore" | "rounds"
  >
}): Promise<SodexOrderIntent> {
  if (!input.symbol.trim()) {
    throw new Error("SoDEX symbol is required.")
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Order size must be a positive number.")
  }

  const endpoint = getSodexEndpoint()
  const isBuy = input.side === "buy"
  const side: "BUY" | "SELL" = isBuy ? "BUY" : "SELL"
  const walletAddress = validateWalletAddress(input.walletAddress)
  const amount = formatOrderAmount(input.amount)
  const accountID = optionalAccountId()
  const verifyingContract = optionalVerifyingContract()
  const symbolRule = await getSodexSymbolRule(input.symbol).catch(() => null)
  const tradingRules = symbolRule
    ? {
        status: symbolRule.status,
        pricePrecision: symbolRule.pricePrecision,
        quantityPrecision: symbolRule.quantityPrecision,
        quoteCoinPrecision: symbolRule.quoteCoinPrecision,
        tickSize: symbolRule.tickSize,
        stepSize: symbolRule.stepSize,
        marketMinQuantity: symbolRule.marketMinQuantity,
        minNotional: symbolRule.minNotional,
      }
    : undefined
  const amountProblems = compactStrings([
    precisionProblem({
      amount,
      symbol: input.symbol,
      side: input.side,
      quoteCoinPrecision: symbolRule?.quoteCoinPrecision,
      quantityPrecision: symbolRule?.quantityPrecision,
    }),
    minimumProblem({
      amount: input.amount,
      side: input.side,
      marketMinQuantity: symbolRule?.marketMinQuantity,
      minNotional: symbolRule?.minNotional,
    }),
  ])
  const clientOrderId = `cd-${stableId(
    `${input.symbol}-${input.side}-${amount}-${Date.now()}`,
  )}`
  const unresolved = compactStrings([
    walletAddress ? "" : "signer wallet",
    accountID.problem,
    symbolRule ? "" : "symbolID from /markets/symbols",
    symbolRule?.status === "TRADING" ? "" : "tradable SoDEX symbol",
    ...amountProblems,
    verifyingContract.problem,
    "EIP-712 payload hash and signature",
  ])
  const missing = compactStrings([
    walletAddress ? "" : "wallet signer",
    accountID.problem,
    symbolRule ? "" : "SoDEX symbolID",
    symbolRule?.status === "TRADING" ? "" : "TRADING symbol status",
    ...amountProblems,
    verifyingContract.problem,
    "EIP-712 signature",
    "X-API-Nonce header",
  ])
  const order = {
    type: "MARKET" as const,
    timeInForce: "IOC" as const,
    symbol: input.symbol,
    symbolID: symbolRule?.id ?? null,
    side,
    ...(isBuy ? { funds: amount } : { quantity: amount }),
  }
  const requestOrder = {
    clOrdID: clientOrderId,
    symbolID: symbolRule?.id ?? null,
    side: side === "BUY" ? ORDER_SIDE.BUY : ORDER_SIDE.SELL,
    type: ORDER_TYPE.MARKET,
    timeInForce: TIME_IN_FORCE.IOC,
    ...(isBuy ? { funds: amount } : { quantity: amount }),
  }

  return {
    venue: "SoDEX spot",
    status: "unsigned-preview",
    endpoint,
    docsUrl: SODEX_DOCS_URL,
    symbol: input.symbol,
    side: input.side,
    inputSize: input.amount,
    inputUnit: isBuy ? "USDC" : "base",
    walletAddress: walletAddress || undefined,
    sourceDebateId: input.debate?.id,
    clientOrderId,
    symbolID: symbolRule?.id ?? null,
    tradingRules,
    riskContext: input.debate
      ? {
          winnerLean: input.debate.winnerLean,
          confidenceScore: input.debate.confidenceScore,
          evidenceIds: Array.from(
            new Set(
              input.debate.rounds.flatMap((round) => [
                ...round.bull.evidenceIds,
                ...round.bear.evidenceIds,
              ]),
            ),
          ).slice(0, 8),
        }
      : undefined,
    order,
    request: {
      method: "POST",
      path: "/trade/orders/batch",
      body: {
        accountID: accountID.value,
        orders: [requestOrder],
      },
      unresolved,
    },
    signing: {
      scheme: "EIP-712 ExchangeAction",
      domain: {
        name: "spot",
        version: "1",
        chainId: endpoint.includes("mainnet") ? 286623 : 138565,
        verifyingContract: verifyingContract.value,
      },
      submitPath: "/trade/orders/batch",
      requiredHeaders: ["X-API-Sign", "X-API-Nonce"],
      optionalHeaders: ["X-API-Key"],
      nonce: {
        recommended: Date.now().toString(),
        rule: "Use a unique millisecond nonce within SoDEX's accepted time window; nonces are tracked per signing address or API key.",
      },
      apiKeyHeader:
        "X-API-Key is the SoDEX API key name. It can be omitted only when signing directly with the master wallet.",
    },
    readiness: {
      canSubmit: false,
      missing,
      nextSteps: [
        walletAddress
          ? "Use the connected wallet as the signer."
          : "Connect a signer-controlled account.",
        accountID.value
          ? "Use the configured SoDEX accountID."
          : "Resolve the SoDEX accountID.",
        symbolRule
          ? `Use symbolID ${symbolRule.id} and ${symbolRule.name} trading rules.`
          : "Resolve symbol trading rules and precision.",
        verifyingContract.value
          ? "Use the configured EIP-712 verifying contract."
          : "Configure the SoDEX EIP-712 verifying contract.",
        "Sign the ExchangeAction payload with EIP-712.",
        "Submit the signed batch to the SoDEX write endpoint after user confirmation.",
      ],
    },
    createdAt: new Date().toISOString(),
  }
}
