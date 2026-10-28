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
    <span className="flex items-center gap-2.5">
      <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent-bright" />
      <span className="text-[13px] font-medium tracking-[0.22em]">CLIENTREADY</span>
    </span>
  );
}

export function SiteHeader() {
  const path = usePathname();
  if (path?.startsWith("/practice/session")) return null;
  return (
    <header className="no-print rule-b sticky top-0 z-40 bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="ClientReady home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "label px-2.5 py-1.5 transition-colors sm:px-3",
                path === n.href ? "text-signal" : "text-fg-muted hover:text-fg",
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
