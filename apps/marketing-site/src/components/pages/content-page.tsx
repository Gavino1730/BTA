import Link from "next/link";

import { AmbientGrid } from "@/components/sections/ambient-grid";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { GlassPanel } from "@/components/ui/glass-panel";

type ContentSection = {
  title: string;
  points: string[];
};

type PageLink = {
  label: string;
  href: string;
};

type ContentPageProps = {
  eyebrow: string;
  title: string;
  summary: string;
  sections: ContentSection[];
  primaryCta: PageLink;
  secondaryCta?: PageLink;
};

export function ContentPage({
  eyebrow,
  title,
  summary,
  sections,
  primaryCta,
  secondaryCta,
}: ContentPageProps): JSX.Element {
  return (
    <>
      <AmbientGrid />
      <Navbar />
      <main id="main-content" className="mx-auto w-[min(1200px,92vw)] py-16 md:py-20">
        <section className="space-y-6">
          <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">{eyebrow}</p>
          <h1 className="max-w-5xl font-display text-5xl leading-[0.96] text-[var(--text-primary)] md:text-7xl">{title}</h1>
          <p className="max-w-3xl text-lg leading-8 text-[var(--text-secondary)] md:text-xl">{summary}</p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href={primaryCta.href}
              className="inline-flex items-center rounded-full border border-[var(--border-strong)] bg-[rgba(255,255,255,0.9)] px-5 py-2.5 text-sm font-semibold text-[#3e2f93] transition hover:brightness-95"
            >
              {primaryCta.label}
            </Link>
            {secondaryCta ? (
              <Link
                href={secondaryCta.href}
                className="inline-flex items-center rounded-full border border-[var(--border-soft)] bg-[rgba(44,35,108,0.55)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[rgba(44,35,108,0.7)]"
              >
                {secondaryCta.label}
              </Link>
            ) : null}
          </div>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-2">
          {sections.map((section) => (
            <GlassPanel key={section.title} className="p-6">
              <h2 className="font-display text-3xl text-[var(--text-primary)]">{section.title}</h2>
              <ul className="mt-4 space-y-2">
                {section.points.map((point) => (
                  <li
                    key={point}
                    className="rounded-lg border border-[var(--border-soft)] bg-[rgba(31,25,80,0.52)] px-3 py-2 text-[15px] leading-7 text-[var(--text-secondary)]"
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </GlassPanel>
          ))}
        </section>
      </main>
      <Footer />
    </>
  );
}
