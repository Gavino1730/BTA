import { X } from "lucide-react";
import Link from "next/link";

import { footerGroups } from "@/content/homepage";

export function Footer(): JSX.Element {
  return (
    <footer className="mx-auto w-[min(1200px,92vw)] border-t border-[var(--border-soft)] pb-10 pt-14">
      <div className="mb-10 flex flex-wrap items-start justify-between gap-8">
        <div className="max-w-sm space-y-3">
          <img src="/brand-icon.png" alt="BTA Courtside" className="h-10 w-auto" />
          <p className="text-sm text-[var(--text-secondary)]">
            Elite basketball operations software for live stats, game control, film review, and AI coaching insight.
          </p>
          <div className="flex gap-2 pt-1">
            <a
              href="https://twitter.com/btacourtside"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Follow BTA on X"
              className="inline-grid size-8 place-items-center rounded-lg border border-[var(--border-soft)] bg-[rgba(28,35,64,0.85)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              <X className="size-3.5" />
            </a>
            <a
              href="https://linkedin.com/company/btacourtside"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="BTA on LinkedIn"
              className="inline-grid size-8 place-items-center rounded-lg border border-[var(--border-soft)] bg-[rgba(28,35,64,0.85)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              {/* LinkedIn "in" logo */}
              <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                <rect x="2" y="9" width="4" height="12" />
                <circle cx="4" cy="4" r="2" />
              </svg>
            </a>
          </div>
        </div>
        <div className="grid flex-1 gap-7 sm:grid-cols-2 lg:grid-cols-4">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                {group.title}
              </p>
              <div className="space-y-2 text-sm text-[var(--text-secondary)]">
                {group.links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="block transition-colors hover:text-[var(--text-primary)]"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-soft)] pt-5 text-xs text-[var(--text-tertiary)]">
        <p>Copyright {new Date().getFullYear()} BTA Courtside</p>
        <p>Built for coaches, operators, and programs</p>
      </div>
    </footer>
  );
}
