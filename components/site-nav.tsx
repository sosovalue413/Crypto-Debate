import Link from "next/link"

const links = [
  { href: "/", label: "Debate" },
  { href: "/archive", label: "Archive" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/sodex", label: "SoDEX" },
  { href: "/methodology", label: "Methodology" },
]

export function SiteNav({ active }: { active?: string }) {
  return (
    <nav className="mb-10 flex flex-col gap-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <Link
        href="/"
        className="font-[family-name:var(--font-display)] text-lg font-bold text-[#ffee03]"
      >
        CryptoDebate
      </Link>
      <div className="flex flex-wrap gap-4 text-white/60">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              active === link.href
                ? "text-white"
                : "transition-colors hover:text-white"
            }
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
