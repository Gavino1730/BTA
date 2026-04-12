import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getSiteUrl } from "@/lib/site-url";
import { PageTransition } from "@/components/layout/page-transition";
import "./globals.css";

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const displayFont = Inter({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BTA Courtside Intelligence | Live Basketball Operations Platform",
  description:
    "BTA Courtside Intelligence is premium basketball operations software for live stat keeping, game workflows, synced film review, and AI coaching insights.",
  metadataBase: new URL(getSiteUrl()),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "BTA Courtside",
    description:
      "Live stat keeping, game operations, film sync, and AI coaching insights in one connected basketball platform.",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "BTA Courtside platform preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BTA Courtside",
    description:
      "Live basketball operations software for coaches, operators, and programs.",
    images: ["/twitter-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[120] focus:rounded-md focus:bg-[var(--panel-1)] focus:px-3 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}
