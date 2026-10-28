"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";
import { Wordmark } from "./wordmark";

const NAV = [
  { href: "/practice", label: "Practise" },
  { href: "/history", label: "History" },
  { href: "/#how-it-works", label: "How it works" },
];

export function Logo() {
  return <Wordmark />;
}

export function SiteHeader() {
  const path = usePathname();
  if (path?.startsWith("/practice/session")) return null;
  return (
    <header className="no-print rule-b sticky top-0 z-40 bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="ClientReady home" className="inline-flex min-h-11 items-center">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "label min-h-11 items-center px-2.5 transition-colors sm:px-3",
                path === n.href ? "text-signal" : "text-fg-muted hover:text-fg",
                n.href.startsWith("/#") ? "hidden sm:inline-flex" : "inline-flex",
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
