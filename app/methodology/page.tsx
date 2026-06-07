import Link from "next/link"

const pipeline = [
  "Resolve thesis assets through the SoSoValue currency list.",
  "Collect SoSoValue market, kline, ETF flow, news, and Index evidence.",
  "Collect SoDEX public spot market context for the same symbols.",
  "Send OpenAI only the thesis and summarized evidence cards with IDs.",
  "Reject invalid citation IDs and repair speeches with unsupported numeric claims.",
  "Save the debate, grounding audit, outcome baseline, and community ballot state.",
]

const guards = [
  "Concrete market claims must appear in the thesis or a cited evidence card.",
  "Bull and Bear speeches keep only evidence IDs that exist in the collected dataset.",
  "If a speech invents unsupported numbers, it is rebuilt from cited evidence.",
  "SoDEX execution is an unsigned preview until a signer, API key, nonce, and EIP-712 signature exist.",
]

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-[#05070b] px-6 py-10 text-white md:px-10">
      <div className="mx-auto max-w-5xl">
        <nav className="mb-10 flex items-center justify-between text-sm">
          <Link href="/" className="font-semibold text-[#ffee03]">
            CryptoDebate
          </Link>
          <Link href="/archive" className="text-white/60 hover:text-white">
            Archive
          </Link>
        </nav>

        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffee03]">
          Grounding method
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold md:text-6xl">
          Evidence before argument
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-white/62">
          CryptoDebate does not ask an AI model to browse or guess. The backend
          builds a constrained evidence set first, then the model debates inside
          that boundary. A post-generation audit repairs unsupported claims.
        </p>

        <section className="mt-12 grid gap-8 md:grid-cols-2">
          <div className="border-y border-white/12 py-5">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
              Pipeline
            </h2>
            <div className="mt-5 space-y-4">
              {pipeline.map((item, index) => (
                <div key={item} className="flex gap-4">
                  <span className="font-[family-name:var(--font-display)] text-xl font-bold text-[#ffee03]">
                    {(index + 1).toString().padStart(2, "0")}
                  </span>
                  <p className="text-sm leading-relaxed text-white/65">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-y border-white/12 py-5">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
              Factual guards
            </h2>
            <div className="mt-5 space-y-4">
              {guards.map((item) => (
                <div key={item} className="border-l border-[#ffee03]/40 pl-4">
                  <p className="text-sm leading-relaxed text-white/65">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 border-y border-white/12 py-5">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
            Integrated data sources
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <a
              href="https://sosovalue-1.gitbook.io/sosovalue-api-doc"
              className="border-l border-white/12 pl-4 text-sm text-white/65 hover:text-white"
            >
              SoSoValue market, ETF, kline, and news evidence
            </a>
            <a
              href="https://ssi.sosovalue.com/en"
              className="border-l border-white/12 pl-4 text-sm text-white/65 hover:text-white"
            >
              SoSoValue Indexes constituents, returns, and historical klines
            </a>
            <a
              href="https://sodex.com/documentation"
              className="border-l border-white/12 pl-4 text-sm text-white/65 hover:text-white"
            >
              SoDEX public market context and signed execution readiness
            </a>
          </div>
        </section>
      </div>
    </main>
  )
}
