import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/site"

const routes = ["/", "/archive", "/leaderboard", "/sodex", "/methodology"]

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: now,
    changeFrequency: route === "/" ? "daily" : "hourly",
    priority: route === "/" ? 1 : 0.8,
  }))
}
