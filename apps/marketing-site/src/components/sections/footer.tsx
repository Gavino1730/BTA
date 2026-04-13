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
