import type { DebateResult, SodexOrderIntent } from "@/lib/types"
import { getSodexEndpoint } from "@/lib/sodex"
import { stableId } from "@/lib/server-utils"

const SODEX_DOCS_URL =
  "https://sodex.com/documentation/api/rest-v1/sodex-rest-spot-api"

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

export function buildSodexOrderIntent(input: {
  symbol: string
  side: "buy" | "sell"
  amount: number
  walletAddress?: string
  debate?: Pick<
    DebateResult,
    "id" | "winnerLean" | "confidenceScore" | "rounds"
  >
}): SodexOrderIntent {
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
  const clientOrderId = `cd-${stableId(
    `${input.symbol}-${input.side}-${amount}-${Date.now()}`,
  )}`
  const accountID = "<resolve-accountID-from-signer>"
  const unresolved = [
    walletAddress ? "" : "signer wallet",
    "SoDEX accountID",
    "symbolID and precision rules from /markets/symbols",
    "EIP-712 payload hash",
  ].filter(Boolean)
  const missing = [
    walletAddress ? "" : "wallet signer",
    "SoDEX accountID",
    "symbolID and precision validation",
    "EIP-712 signature",
    "X-API-Nonce header",
  ].filter(Boolean)
  const order = {
    type: "MARKET" as const,
    timeInForce: "IOC" as const,
    symbol: input.symbol,
    side,
    ...(isBuy ? { funds: amount } : { quantity: amount }),
  }
  const requestOrder = {
    clOrdID: clientOrderId,
    ...order,
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
        accountID,
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
        verifyingContract: "0x0000000000000000000000000000000000000000",
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
        "Resolve the SoDEX accountID and symbol trading rules.",
        "Sign the ExchangeAction payload with EIP-712.",
        "Submit the signed batch to the SoDEX write endpoint after user confirmation.",
      ],
    },
    createdAt: new Date().toISOString(),
  }
}
