import type { Metadata } from "next"
import { HeroSection } from "@/components/hero-section"
import { SITE_DESCRIPTION } from "@/lib/site"

export const metadata: Metadata = {
  title: "Live Crypto Debate",
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
}

export default function Home() {
  return (
    <main>
      <HeroSection />
    </main>
  )
}
