export const SITE_NAME = "CryptoDebate"

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://cryptodebate.vercel.app"
).replace(/\/$/, "")

export const SITE_DESCRIPTION =
  "AI bull and bear agents debate crypto theses with live SoSoValue evidence, SoSoValue Indexes, grounding audits, outcome tracking, and SoDEX market context."

export function absoluteUrl(path = "/") {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`
}
