import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter_Tight } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"], weight: ["400", "500", "600"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const TITLE = "ClientReady: practise client calls before the real one";
const DESCRIPTION =
  "Voice role-play with simulated international clients, then evidence-based coaching. Built for Indian freelancers, powered by Gnani Prisma and Timbre.";

export const metadata: Metadata = {
  metadataBase: new URL("https://client-readyyy.vercel.app"),
  title: { default: TITLE, template: "%s · ClientReady" },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/", siteName: "ClientReady", type: "website", locale: "en_IN" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = { themeColor: "#e8e1d6" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/* Browser extensions (e.g. ColorZilla's cz-shortcut-listen) add attributes to <body> before React hydrates. */}
      <body className={`${interTight.variable} ${geistMono.variable} min-h-dvh antialiased`} suppressHydrationWarning>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-fg focus:px-3 focus:py-2 focus:text-bg">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
