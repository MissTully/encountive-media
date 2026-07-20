"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Every area of the studio, in journey order, with a plain-language label.
const LINKS = [
  { href: "/projects", label: "Projects" },
  { href: "/library", label: "Image Library" },
  { href: "/music", label: "Music" },
  { href: "/videos", label: "Video Studio" },
  { href: "/brand", label: "Brand Kit" },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="flex min-w-0 items-center gap-1 overflow-x-auto"
    >
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors ${
              active
                ? "bg-accent-soft font-medium text-accent-ink"
                : "text-muted hover:bg-accent-soft/60 hover:text-ink"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
