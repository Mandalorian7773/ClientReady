"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

const NAV = [
  { href: "/practice", label: "Practise" },
  { href: "/history", label: "History" },
  { href: "/#how-it-works", label: "How it works" },
];

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="relative grid h-7 w-7 place-items-center rounded-lg bg-signal text-signal-ink">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M5 10v4M9 7v10M13 9v6M17 5v14M21 10v4" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">ClientReady</span>
    </span>
  );
}

export function SiteHeader() {
  const path = usePathname();
  if (path?.startsWith("/practice/session")) return null;
  return (
    <header className="no-print sticky top-0 z-40 border-b border-border/60 bg-bg/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="ClientReady home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "rounded-md px-2.5 py-1.5 transition-colors sm:px-3",
                path === n.href ? "text-fg" : "text-fg-muted hover:text-fg",
                n.href.startsWith("/#") && "hidden sm:inline",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
