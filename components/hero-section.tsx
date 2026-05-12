"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  Clipboard,
  ExternalLink,
  Gavel,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Vote,
  WalletCards,
  Zap,
} from "lucide-react"
import {
  Ascii,
  CursorTrail,
  Godrays,
  RadialGradient,
  Shader,
  Tritone,
} from "shaders/react"
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type {
  DebateResult,
  DebateSide,
  DebateVotes,
  EvidencePoint,
  SodexMarket,
} from "@/lib/types"

const examples = [
  "BTC will hit $200k by the end of 2026",
  "Ethereum will flip Bitcoin in market cap by 2027",
  "Solana will outperform ETH this cycle",
  "AI tokens are entering a new supercycle",
]

const loadingCopy = [
  "Resolving assets from the thesis",
  "Pulling SoSoValue market, flow, and news evidence",
  "Checking SoDEX public market data",
  "Letting Bull and Bear build their cases",
]

type FeaturedTopic = {
  thesis: string
  title: string
  sourceUrl?: string
}

type SodexState = {
  endpoint: string
  markets: SodexMarket[]
  status: "live" | "error"
}

export function HeroSection() {
  const [thesis, setThesis] = useState(examples[0])
  const [mode, setMode] = useState<"full" | "quick">("full")
  const [result, setResult] = useState<DebateResult | null>(null)
  const [archive, setArchive] = useState<DebateResult[]>([])
  const [archiveQuery, setArchiveQuery] = useState("")
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(
    null,
  )
  const [featured, setFeatured] = useState<FeaturedTopic | null>(null)
  const [sodex, setSodex] = useState<SodexState | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [intentAmount, setIntentAmount] = useState("100")
  const [intentSide, setIntentSide] = useState<"buy" | "sell">("buy")
  const [intent, setIntent] = useState<string | null>(null)

  useEffect(() => {
    const stored = window.localStorage.getItem("cryptodebate.archive")

    if (stored) {
      try {
        setArchive(JSON.parse(stored) as DebateResult[])
      } catch {
        setArchive([])
      }
    }
  }, [])

  useEffect(() => {
    fetch("/api/featured")
      .then((response) => response.json())
      .then((payload: { topic?: FeaturedTopic }) => {
        if (payload.topic) {
          setFeatured(payload.topic)
        }
      })
      .catch(() => setFeatured(null))

    fetch("/api/sodex")
      .then((response) => response.json())
      .then((payload: SodexState) => setSodex(payload))
      .catch(() => setSodex(null))
  }, [])

  useEffect(() => {
    if (!loading) {
      return
    }

    const interval = window.setInterval(() => {
      setLoadingStep((step) => (step + 1) % loadingCopy.length)
    }, 1100)

    return () => window.clearInterval(interval)
  }, [loading])

  useEffect(() => {
    if (!result) {
      return
    }

    setSelectedEvidenceId(result.evidence[0]?.id ?? null)
    setIntentSide(result.winnerLean === "Bear" ? "sell" : "buy")

    const nextArchive = [
      result,
      ...archive.filter((item) => item.id !== result.id),
    ].slice(0, 20)

    setArchive(nextArchive)
    window.localStorage.setItem(
      "cryptodebate.archive",
      JSON.stringify(nextArchive),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  const filteredArchive = useMemo(() => {
    const query = archiveQuery.toLowerCase().trim()

    if (!query) {
      return archive
    }

    return archive.filter((item) =>
      [
        item.thesis,
        item.title,
        item.assetSymbols.join(" "),
        item.winnerLean,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    )
  }, [archive, archiveQuery])

  const selectedEvidence = useMemo(() => {
    return (
      result?.evidence.find((item) => item.id === selectedEvidenceId) ??
      result?.evidence[0] ??
      null
    )
  }, [result, selectedEvidenceId])

  const selectedMarket = useMemo(() => {
    if (!sodex?.markets.length) {
      return null
    }

    const assets = result?.assetSymbols ?? []

    return (
      sodex.markets.find((market) =>
        assets.some((asset) =>
          market.symbol.toUpperCase().includes(asset.toUpperCase()),
        ),
      ) ?? sodex.markets[0]
    )
  }, [result?.assetSymbols, sodex?.markets])

  async function generate(nextMode: "full" | "quick") {
    setLoading(true)
    setLoadingStep(0)
    setError(null)
    setCopied(false)
    setIntent(null)
    setMode(nextMode)

    try {
      const response = await fetch("/api/debate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          thesis,
          mode: nextMode,
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to generate debate.")
      }

      setResult(payload as DebateResult)
      window.setTimeout(() => {
        document
          .getElementById("debate-floor")
          ?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 100)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to generate debate.",
      )
    } finally {
      setLoading(false)
    }
  }

  async function submitVote(vote: DebateSide) {
    if (!result) {
      return
    }

    const optimistic = {
      ...result.votes,
      [vote]: result.votes[vote] + 1,
    }

    setResult({ ...result, votes: optimistic })

    try {
      const response = await fetch("/api/vote", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ debateId: result.id, vote }),
      })
      const payload = (await response.json()) as { votes?: DebateVotes }

      if (payload.votes) {
        setResult((current) =>
          current ? { ...current, votes: payload.votes as DebateVotes } : current,
        )
      }
    } catch {
      return
    }
  }

  async function copyShareCard() {
    if (!result) {
      return
    }

    const total = totalVotes(result.votes)
    const text = [
      "CryptoDebate",
      `"${result.thesis}"`,
      `Bull ${votePercent(result.votes.bull, total)} vs Bear ${votePercent(
        result.votes.bear,
        total,
      )} vs Draw ${votePercent(result.votes.draw, total)}`,
      `Verdict: ${result.quickVerdict.verdict}`,
      `Evidence: ${result.evidence
        .slice(0, 2)
        .map((item) => `${item.title} (${item.value})`)
        .join(" | ")}`,
    ].join("\n")

    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  function buildSodexIntent() {
    if (!selectedMarket) {
      return
    }

    const payload = {
      venue: "SoDEX testnet spot",
      endpoint: sodex?.endpoint,
      action: "unsignedOrderIntent",
      symbol: selectedMarket.symbol,
      side: intentSide,
      quoteSizeUSDC: Number(intentAmount),
      sourceDebateId: result?.id,
      createdAt: new Date().toISOString(),
      nextStep:
        "Connect wallet or API signer, create EIP-712 signature, then submit to SoDEX signed write endpoint.",
    }

    setIntent(JSON.stringify(payload, null, 2))
  }

  return (
    <>
      <ShaderBackdrop />

      <main className="relative text-foreground">
        <section className="relative flex min-h-screen flex-col">
          <nav className="flex items-start justify-between p-6 md:p-10">
            <div className="flex flex-col gap-1 text-sm tracking-wide">
              <a
                href="#debate-floor"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Debate
              </a>
              <a
                href="#evidence"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Evidence
              </a>
              <a
                href="#archive"
                className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                Archive <ExternalLink className="size-3" />
              </a>
            </div>

            <div className="text-right">
              <div className="font-[family-name:var(--font-display)] text-lg font-bold">
                CryptoDebate
              </div>
              <div className="text-xs uppercase tracking-[0.28em] text-[#ffee03]">
                Wave 1
              </div>
            </div>
          </nav>

          <div className="flex flex-1 flex-col justify-center px-6 pb-28 md:px-10">
            <div className="max-w-7xl">
              <h1 className="font-[family-name:var(--font-display)] text-[clamp(3.3rem,14vw,13rem)] font-bold leading-[0.85] tracking-normal text-foreground">
                <span className="block">Crypto</span>
                <span className="block">Debate</span>
                <span className="block font-[family-name:var(--font-creative)] text-[#ffee03]">
                  Live
                </span>
              </h1>

              <div className="mt-10 grid gap-8 md:mt-14 md:grid-cols-[minmax(0,0.9fr)_minmax(340px,520px)] md:items-end md:gap-14">
                <div className="max-w-xl">
                  <p className="text-lg leading-relaxed text-muted-foreground md:text-xl">
                    Type any crypto thesis. Bull AI and Bear AI argue it with
                    live SoSoValue evidence, community voting, an archive, and a
                    SoDEX action intent when the debate is done.
                  </p>

                  <div className="mt-6 flex flex-wrap gap-2">
                    <StatusPill
                      label="SoSoValue evidence"
                      state={result?.dataHealth.sosoValue ?? "ready"}
                    />
                    <StatusPill
                      label="SoDEX market data"
                      state={sodex?.status ?? "live"}
                    />
                    <StatusPill
                      label="OpenAI debate"
                      state={result?.dataHealth.openAi ?? "ready"}
                    />
                  </div>
                </div>

                <div className="border-y border-white/18 bg-black/35 py-5 backdrop-blur-md">
                  <label
                    htmlFor="thesis"
                    className="text-xs font-semibold uppercase tracking-[0.24em] text-[#ffee03]"
                  >
                    Enter thesis
                  </label>
                  <textarea
                    id="thesis"
                    value={thesis}
                    onChange={(event) => setThesis(event.target.value)}
                    className="mt-4 min-h-28 w-full resize-none bg-transparent text-xl font-semibold leading-snug text-white outline-none placeholder:text-white/35"
                    placeholder="Example: BTC will hit $200k by end of 2026"
                  />

                  <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
                    {examples.map((example) => (
                      <button
                        key={example}
                        onClick={() => setThesis(example)}
                        className="rounded-md border border-white/12 px-3 py-2 text-left text-xs text-white/68 transition hover:border-[#ffee03]/70 hover:text-white"
                      >
                        {example}
                      </button>
                    ))}
                  </div>

                  {featured ? (
                    <button
                      onClick={() => setThesis(featured.thesis)}
                      className="mt-4 flex w-full items-center gap-3 border-y border-[#ffee03]/30 py-3 text-left text-sm text-white/75 transition hover:text-white"
                    >
                      <Sparkles className="size-4 text-[#ffee03]" />
                      <span className="line-clamp-2">
                        Daily featured: {featured.thesis}
                      </span>
                    </button>
                  ) : null}

                  {error ? (
                    <div className="mt-4 border-l-2 border-red-400 pl-3 text-sm text-red-200">
                      {error}
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <Button
                      size="lg"
                      onClick={() => generate("full")}
                      disabled={loading}
                      className="group h-12 flex-1 bg-[#ffee03] text-black hover:bg-white"
                    >
                      {loading && mode === "full" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Gavel className="size-4" />
                      )}
                      Run 3-Round Debate
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={() => generate("quick")}
                      disabled={loading}
                      className="h-12 border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white hover:text-black"
                    >
                      {loading && mode === "quick" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Zap className="size-4" />
                      )}
                      Quick Verdict
                    </Button>
                  </div>

                  {loading ? (
                    <div className="mt-4 flex items-center gap-3 text-sm text-white/68">
                      <Loader2 className="size-4 animate-spin text-[#ffee03]" />
                      {loadingCopy[loadingStep]}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-border/50 bg-black px-6 py-5 md:px-10">
            <span className="font-[family-name:var(--font-display)] text-sm font-semibold">
              AI debate engine
            </span>
            <span className="max-w-[60vw] text-right text-sm text-muted-foreground">
              Live data layer: SoSoValue API plus SoDEX public market endpoints
            </span>
          </div>
        </section>

        <section
          id="debate-floor"
          className="border-y border-white/10 bg-black/62 px-6 py-16 backdrop-blur-xl md:px-10"
        >
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffee03]">
                  Debate floor
                </p>
                <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-normal md:text-6xl">
                  {result ? result.title : "Ready for the first thesis"}
                </h2>
              </div>

              {result ? (
                <div className="flex flex-wrap gap-2">
                  <MetaPill icon={BrainCircuit}>
                    {result.engine === "openai" ? "OpenAI debate" : "Evidence fallback"}
                  </MetaPill>
                  <MetaPill icon={BarChart3}>
                    {result.evidence.length} live evidence cards
                  </MetaPill>
                  <MetaPill icon={ShieldCheck}>
                    Confidence {result.confidenceScore}/100
                  </MetaPill>
                </div>
              ) : null}
            </div>

            {result ? (
              <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
                <div className="space-y-8">
                  <QuickVerdictPanel result={result} />

                  <div className="space-y-8">
                    {result.rounds.map((round) => (
                      <RoundBlock
                        key={`${result.id}-${round.round}`}
                        round={round}
                        evidence={result.evidence}
                        onEvidence={setSelectedEvidenceId}
                      />
                    ))}
                  </div>

                  <VotePanel votes={result.votes} onVote={submitVote} />
                </div>

                <div id="evidence" className="space-y-8">
                  <EvidencePanel
                    evidence={result.evidence}
                    selected={selectedEvidence}
                    selectedId={selectedEvidenceId}
                    onSelect={setSelectedEvidenceId}
                  />

                  <SharePanel
                    result={result}
                    copied={copied}
                    onCopy={copyShareCard}
                  />

                  <SodexActionPanel
                    sodex={sodex}
                    market={selectedMarket}
                    amount={intentAmount}
                    side={intentSide}
                    intent={intent}
                    onAmount={setIntentAmount}
                    onSide={setIntentSide}
                    onBuild={buildSodexIntent}
                  />
                </div>
              </div>
            ) : (
              <EmptyWorkflow />
            )}
          </div>
        </section>

        <section
          id="archive"
          className="bg-[#05070b]/92 px-6 py-16 md:px-10"
        >
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffee03]">
                    Archive and search
                  </p>
                  <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-normal md:text-5xl">
                    Every debate becomes research memory
                  </h2>
                </div>
                <div className="flex min-w-72 items-center gap-2 border-b border-white/20 pb-2 text-white/75">
                  <Search className="size-4" />
                  <input
                    value={archiveQuery}
                    onChange={(event) => setArchiveQuery(event.target.value)}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-white/35"
                    placeholder="Search by token, thesis, or outcome"
                  />
                </div>
              </div>

              <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
                {filteredArchive.length ? (
                  filteredArchive.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setResult(item)
                        document
                          .getElementById("debate-floor")
                          ?.scrollIntoView({ behavior: "smooth" })
                      }}
                      className="grid w-full gap-4 py-5 text-left transition hover:bg-white/[0.03] md:grid-cols-[1fr_160px_120px]"
                    >
                      <div>
                        <div className="font-semibold text-white">{item.thesis}</div>
                        <div className="mt-1 text-sm text-white/55">
                          {item.assetSymbols.join(", ") || "Market-wide"} ·{" "}
                          {new Date(item.generatedAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="text-sm text-white/70">
                        {item.evidence.length} evidence cards
                      </div>
                      <div className="font-[family-name:var(--font-display)] text-lg font-bold text-[#ffee03]">
                        {item.winnerLean}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="py-8 text-white/55">
                    Run a debate and it will appear here instantly.
                  </div>
                )}
              </div>
            </div>

            <Leaderboard archive={archive} />
          </div>
        </section>
      </main>
    </>
  )
}

function ShaderBackdrop() {
  return (
    <div className="fixed inset-0 -z-10" aria-hidden="true">
      <Shader className="absolute inset-0">
        <RadialGradient
          center={{ x: 0.83, y: 0.2 }}
          colorA="#030d2b"
          colorB="#010f14"
          colorSpace="oklch"
          radius={1.37}
        />
        <Ascii
          cellSize={30}
          characters="||||"
          fontFamily="Space Mono"
          spacing={1}
        >
          <Godrays
            backgroundColor="#b59318"
            center={{ x: 0.85, y: 0.15 }}
            density={0.3}
            intensity={0.96}
            rayColor="#fcfeff"
            speed={1}
            spotty={1}
          />
          <CursorTrail
            colorA="#ffffff"
            colorB="#000000"
            colorSpace="linear"
            length={1}
            radius={0.5}
            shrink={5}
          />
          <Tritone
            blendMid={0.73}
            colorA="#070b1f"
            colorB="#2600ff"
            colorC="#ffee03"
            colorSpace="oklch"
            visible={true}
          />
        </Ascii>
      </Shader>
    </div>
  )
}

function StatusPill({
  label,
  state,
}: {
  label: string
  state: "live" | "ready" | "missing-key" | "error"
}) {
  const live = state === "live"
  const ready = state === "ready"

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs",
        live
          ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
          : ready
            ? "border-[#ffee03]/25 bg-[#ffee03]/10 text-[#ffee03]"
          : "border-red-300/25 bg-red-400/10 text-red-100",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          live ? "bg-emerald-300" : ready ? "bg-[#ffee03]" : "bg-red-300",
        )}
      />
      {label}: {state}
    </span>
  )
}

function MetaPill({
  icon: Icon,
  children,
}: {
  icon: typeof BrainCircuit
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-white/12 bg-white/8 px-3 py-2 text-sm text-white/72">
      <Icon className="size-4 text-[#ffee03]" />
      {children}
    </span>
  )
}

function QuickVerdictPanel({ result }: { result: DebateResult }) {
  return (
    <div className="border-y border-white/12 py-5">
      <div className="grid gap-4 md:grid-cols-3">
        <VerdictLine
          label="Bull"
          icon={TrendingUp}
          tone="bull"
          text={result.quickVerdict.bullLine}
        />
        <VerdictLine
          label="Bear"
          icon={TrendingDown}
          tone="bear"
          text={result.quickVerdict.bearLine}
        />
        <VerdictLine
          label="Balanced"
          icon={Gavel}
          tone="neutral"
          text={result.quickVerdict.verdict}
        />
      </div>
    </div>
  )
}

function VerdictLine({
  label,
  icon: Icon,
  text,
  tone,
}: {
  label: string
  icon: typeof TrendingUp
  text: string
  tone: "bull" | "bear" | "neutral"
}) {
  return (
    <div className="min-h-36 border-l border-white/12 pl-4">
      <div
        className={cn(
          "mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em]",
          tone === "bull" && "text-emerald-300",
          tone === "bear" && "text-red-300",
          tone === "neutral" && "text-[#ffee03]",
        )}
      >
        <Icon className="size-4" />
        {label}
      </div>
      <p className="text-sm leading-relaxed text-white/72">{text}</p>
    </div>
  )
}

function RoundBlock({
  round,
  evidence,
  onEvidence,
}: {
  round: DebateResult["rounds"][number]
  evidence: EvidencePoint[]
  onEvidence: (id: string) => void
}) {
  return (
    <article>
      <div className="mb-4 flex items-center gap-3">
        <span className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#ffee03]">
          {round.round.toString().padStart(2, "0")}
        </span>
        <h3 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-normal">
          {round.label}
        </h3>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <SpeechColumn
          side="Bull"
          speech={round.bull}
          evidence={evidence}
          onEvidence={onEvidence}
        />
        <SpeechColumn
          side="Bear"
          speech={round.bear}
          evidence={evidence}
          onEvidence={onEvidence}
        />
      </div>
    </article>
  )
}

function SpeechColumn({
  side,
  speech,
  evidence,
  onEvidence,
}: {
  side: "Bull" | "Bear"
  speech: DebateResult["rounds"][number]["bull"]
  evidence: EvidencePoint[]
  onEvidence: (id: string) => void
}) {
  const isBull = side === "Bull"
  const usedEvidence = speech.evidenceIds
    .map((id) => evidence.find((item) => item.id === id))
    .filter(Boolean) as EvidencePoint[]

  return (
    <div
      className={cn(
        "border-l-2 py-1 pl-5",
        isBull ? "border-emerald-300" : "border-red-400",
      )}
    >
      <div
        className={cn(
          "mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em]",
          isBull ? "text-emerald-300" : "text-red-300",
        )}
      >
        {isBull ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
        {side} AI
      </div>
      <p className="text-base leading-relaxed text-white/78">{speech.argument}</p>
      {usedEvidence.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {usedEvidence.map((item) => (
            <button
              key={item.id}
              onClick={() => onEvidence(item.id)}
              className="rounded-md border border-white/12 px-2.5 py-1.5 text-xs text-white/62 transition hover:border-[#ffee03]/70 hover:text-white"
            >
              {item.title}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function EvidencePanel({
  evidence,
  selected,
  selectedId,
  onSelect,
}: {
  evidence: EvidencePoint[]
  selected: EvidencePoint | null
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="border-y border-white/12 py-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#ffee03]">
            Evidence panel
          </p>
          <h3 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold">
            Live data cards
          </h3>
        </div>
        <BarChart3 className="size-6 text-white/45" />
      </div>

      <div className="mt-5 space-y-2">
        {evidence.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={cn(
              "w-full rounded-md border px-3 py-3 text-left transition",
              selectedId === item.id
                ? "border-[#ffee03]/70 bg-[#ffee03]/10"
                : "border-white/10 bg-white/[0.03] hover:border-white/28",
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-white">{item.title}</div>
                <div className="mt-1 text-xs text-white/55">{item.summary}</div>
              </div>
              <div className="shrink-0 text-right text-sm font-bold text-[#ffee03]">
                {item.value}
              </div>
            </div>
          </button>
        ))}
      </div>

      {selected ? (
        <div className="mt-5 border-t border-white/10 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">
                Raw source: {selected.source}
              </div>
              <a
                href={selected.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-[#ffee03] hover:text-white"
              >
                Open source docs <ExternalLink className="size-3" />
              </a>
            </div>
            <span className="text-xs text-white/45">
              {new Date(selected.asOf).toLocaleString()}
            </span>
          </div>

          {selected.series?.length ? <EvidenceChart evidence={selected} /> : null}

          <pre className="mt-4 max-h-72 overflow-auto rounded-md bg-black/70 p-4 text-xs leading-relaxed text-white/62">
            {JSON.stringify(selected.raw, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  )
}

function EvidenceChart({ evidence }: { evidence: EvidencePoint }) {
  return (
    <div className="mt-5 h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={evidence.series}>
          <defs>
            <linearGradient id={`fill-${evidence.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ffee03" stopOpacity={0.45} />
              <stop offset="95%" stopColor="#ffee03" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" hide />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            contentStyle={{
              background: "#05070b",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 6,
              color: "white",
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#ffee03"
            fill={`url(#fill-${evidence.id})`}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function VotePanel({
  votes,
  onVote,
}: {
  votes: DebateVotes
  onVote: (vote: DebateSide) => void
}) {
  const total = totalVotes(votes)

  return (
    <div className="border-y border-white/12 py-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-[#ffee03]">
        <Vote className="size-4" />
        Community verdict
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["bull", "bear", "draw"] as DebateSide[]).map((side) => (
          <button
            key={side}
            onClick={() => onVote(side)}
            className="rounded-md border border-white/12 bg-white/[0.03] px-4 py-3 text-left transition hover:border-[#ffee03]/70"
          >
            <span className="block text-sm font-semibold capitalize text-white">
              {side === "draw" ? "Draw" : `${side} won`}
            </span>
            <span className="mt-1 block text-2xl font-bold text-[#ffee03]">
              {votePercent(votes[side], total)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function SharePanel({
  result,
  copied,
  onCopy,
}: {
  result: DebateResult
  copied: boolean
  onCopy: () => void
}) {
  const total = totalVotes(result.votes)

  return (
    <div className="border-y border-white/12 py-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="text-sm font-bold uppercase tracking-[0.18em] text-[#ffee03]">
          Share card
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onCopy}
          className="border-white/20 bg-white/8 text-white hover:bg-white hover:text-black"
        >
          {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="rounded-md border border-white/14 bg-[#05070b] p-5">
        <div className="text-xs uppercase tracking-[0.22em] text-[#ffee03]">
          CryptoDebate
        </div>
        <div className="mt-4 font-[family-name:var(--font-display)] text-2xl font-bold">
          "{result.thesis}"
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
          <span className="rounded-md bg-emerald-300/10 py-2 text-emerald-200">
            Bull {votePercent(result.votes.bull, total)}
          </span>
          <span className="rounded-md bg-red-400/10 py-2 text-red-200">
            Bear {votePercent(result.votes.bear, total)}
          </span>
          <span className="rounded-md bg-white/8 py-2 text-white/72">
            Draw {votePercent(result.votes.draw, total)}
          </span>
        </div>
        <div className="mt-4 text-sm text-white/62">
          Key evidence: {result.evidence[0]?.title} ({result.evidence[0]?.value})
        </div>
      </div>
    </div>
  )
}

function SodexActionPanel({
  sodex,
  market,
  amount,
  side,
  intent,
  onAmount,
  onSide,
  onBuild,
}: {
  sodex: SodexState | null
  market: SodexMarket | null
  amount: string
  side: "buy" | "sell"
  intent: string | null
  onAmount: (value: string) => void
  onSide: (value: "buy" | "sell") => void
  onBuild: () => void
}) {
  return (
    <div className="border-y border-white/12 py-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-[#ffee03]">
        <WalletCards className="size-4" />
        Act on SoDEX
      </div>

      {market ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="border-l border-white/12 pl-3">
              <div className="text-xs text-white/45">Market</div>
              <div className="mt-1 font-semibold text-white">{market.symbol}</div>
            </div>
            <div className="border-l border-white/12 pl-3">
              <div className="text-xs text-white/45">Last</div>
              <div className="mt-1 font-semibold text-white">
                {market.lastPrice || "n/a"}
              </div>
            </div>
            <div className="border-l border-white/12 pl-3">
              <div className="text-xs text-white/45">Endpoint</div>
              <div className="mt-1 truncate text-xs text-white/65">
                {sodex?.endpoint ?? "SoDEX"}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div className="flex rounded-md border border-white/12 p-1">
              {(["buy", "sell"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => onSide(value)}
                  className={cn(
                    "flex-1 rounded px-3 py-2 text-sm font-semibold capitalize transition",
                    side === value
                      ? value === "buy"
                        ? "bg-emerald-300 text-black"
                        : "bg-red-400 text-black"
                      : "text-white/58 hover:text-white",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <input
              value={amount}
              onChange={(event) => onAmount(event.target.value)}
              inputMode="decimal"
              className="rounded-md border border-white/12 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-[#ffee03]/70"
              placeholder="USDC size"
            />
            <Button
              onClick={onBuild}
              className="bg-[#ffee03] text-black hover:bg-white"
            >
              Build Intent
            </Button>
          </div>

          {intent ? (
            <pre className="mt-4 max-h-56 overflow-auto rounded-md bg-black/70 p-4 text-xs leading-relaxed text-white/62">
              {intent}
            </pre>
          ) : (
            <p className="mt-4 text-sm leading-relaxed text-white/55">
              SoDEX public data is live. Signed order submission is intentionally
              kept as an unsigned intent until wallet/API signing credentials are
              added.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-white/55">
          SoDEX public market data is not available right now.
        </p>
      )}
    </div>
  )
}

function EmptyWorkflow() {
  return (
    <div className="mt-12 grid gap-5 md:grid-cols-4">
      {[
        ["1", "Thesis", "User enters any crypto market idea."],
        ["2", "Evidence", "SoSoValue pulls market, flow, and news data."],
        ["3", "Debate", "Bull and Bear argue with cited evidence IDs."],
        ["4", "Vote", "Users pick a winner and build a SoDEX intent."],
      ].map(([step, label, copy]) => (
        <div key={step} className="border-l border-white/14 pl-4">
          <div className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#ffee03]">
            {step}
          </div>
          <div className="mt-3 text-lg font-semibold">{label}</div>
          <div className="mt-2 text-sm leading-relaxed text-white/55">{copy}</div>
        </div>
      ))}
    </div>
  )
}

function Leaderboard({ archive }: { archive: DebateResult[] }) {
  const stats = useMemo(() => {
    const debates = archive.length
    const evidence = archive.reduce((sum, item) => sum + item.evidence.length, 0)
    const bullWins = archive.filter((item) => item.winnerLean === "Bull").length
    const bearWins = archive.filter((item) => item.winnerLean === "Bear").length
    const reputation = debates * 25 + evidence * 3

    return {
      debates,
      evidence,
      bullWins,
      bearWins,
      reputation,
    }
  }, [archive])

  return (
    <aside className="border-y border-white/12 py-5">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffee03]">
        Reputation
      </p>
      <h3 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-normal">
        Analyst score
      </h3>

      <div className="mt-6 space-y-5">
        <MetricRow label="Debates submitted" value={stats.debates} />
        <MetricRow label="Evidence reviewed" value={stats.evidence} />
        <MetricRow label="Bull-leaning verdicts" value={stats.bullWins} />
        <MetricRow label="Bear-leaning verdicts" value={stats.bearWins} />
      </div>

      <div className="mt-8 border-t border-white/10 pt-5">
        <div className="text-sm text-white/55">Your reputation</div>
        <div className="mt-2 font-[family-name:var(--font-display)] text-5xl font-bold text-[#ffee03]">
          {stats.reputation}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-white/55">
          Reputation is calculated locally from debates generated, evidence
          inspected, and verdict history. Wave 2 moves this into user accounts.
        </p>
      </div>
    </aside>
  )
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-3">
      <span className="text-sm text-white/55">{label}</span>
      <span className="font-[family-name:var(--font-display)] text-2xl font-bold">
        {value}
      </span>
    </div>
  )
}

function totalVotes(votes: DebateVotes) {
  return votes.bull + votes.bear + votes.draw
}

function votePercent(value: number, total: number) {
  if (!total) {
    return "0%"
  }

  return `${Math.round((value / total) * 100)}%`
}
