import Link from "next/link";

import { AmbientGrid } from "@/components/sections/ambient-grid";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { GlassPanel } from "@/components/ui/glass-panel";

type ContentSection = {
  title: string;
  intro?: string;
  points: string[];
  note?: string;
};

type PageLink = {
  label: string;
  href: string;
};

type KeyMetric = {
  label: string;
  value: string;
  detail: string;
};

type PageVariant = "atlas" | "pulse" | "horizon" | "ember" | "sprint" | "support";
type SectionLayout = "cards" | "timeline" | "split";

type ContentPageProps = {
  eyebrow: string;
  title: string;
  summary: string;
  sections: ContentSection[];
  primaryCta: PageLink;
  secondaryCta?: PageLink;
  keyMetrics?: KeyMetric[];
  variant?: PageVariant;
  sectionLayout?: SectionLayout;
};

const variantStyles: Record<PageVariant, { hero: string; chip: string; section: string }> = {
  atlas: {
    hero: "bg-[linear-gradient(160deg,rgba(65,52,147,0.82),rgba(37,31,95,0.86))]",
    chip: "bg-[rgba(41,95,169,0.28)]",
    section: "bg-[rgba(31,25,80,0.52)]",
  },
  pulse: {
    hero: "bg-[linear-gradient(160deg,rgba(41,95,169,0.8),rgba(37,31,95,0.84))]",
    chip: "bg-[rgba(42,118,103,0.28)]",
    section: "bg-[rgba(24,63,94,0.46)]",
  },
  horizon: {
    hero: "bg-[linear-gradient(160deg,rgba(76,57,146,0.82),rgba(49,40,114,0.88))]",
    chip: "bg-[rgba(90,63,145,0.32)]",
    section: "bg-[rgba(45,34,109,0.54)]",
  },
  ember: {
    hero: "bg-[linear-gradient(160deg,rgba(102,62,126,0.82),rgba(69,42,93,0.88))]",
    chip: "bg-[rgba(120,82,45,0.34)]",
    section: "bg-[rgba(70,38,82,0.56)]",
  },
  sprint: {
    hero: "bg-[linear-gradient(160deg,rgba(42,118,103,0.78),rgba(30,74,99,0.84))]",
    chip: "bg-[rgba(41,95,169,0.3)]",
    section: "bg-[rgba(23,71,87,0.54)]",
  },
  support: {
    hero: "bg-[linear-gradient(160deg,rgba(74,57,151,0.82),rgba(29,68,102,0.86))]",
    chip: "bg-[rgba(42,118,103,0.3)]",
    section: "bg-[rgba(26,64,97,0.52)]",
  },
};

export function ContentPage({
  eyebrow,
  title,
  summary,
  sections,
  primaryCta,
  secondaryCta,
  keyMetrics,
  variant = "atlas",
  sectionLayout = "cards",
}: ContentPageProps): JSX.Element {
  const styles = variantStyles[variant];

  return (
    <>
      <AmbientGrid />
      <Navbar />
      <main id="main-content" className="mx-auto w-[min(1200px,92vw)] py-16 md:py-20">
        <section className={`space-y-6 rounded-3xl border border-[var(--border-soft)] p-7 md:p-10 ${styles.hero}`}>
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

          {keyMetrics && keyMetrics.length > 0 ? (
            <div className="grid gap-3 pt-4 md:grid-cols-3">
              {keyMetrics.map((metric) => (
                <div key={metric.label} className={`rounded-xl border border-[var(--border-soft)] px-4 py-3 ${styles.chip}`}>
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{metric.label}</p>
                  <p className="mt-2 font-display text-3xl text-[var(--text-primary)]">{metric.value}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{metric.detail}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {sectionLayout === "timeline" ? (
          <section className="mt-10 space-y-4">
            {sections.map((section, index) => (
              <GlassPanel key={section.title} className="p-6">
                <div className="flex items-start gap-4">
                  <div className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[rgba(255,255,255,0.12)] text-sm font-semibold text-[var(--text-primary)]">
                    {index + 1}
                  </div>
                  <div className="w-full">
                    <h2 className="font-display text-3xl text-[var(--text-primary)]">{section.title}</h2>
                    {section.intro ? <p className="mt-2 text-base leading-7 text-[var(--text-secondary)]">{section.intro}</p> : null}
                    <ul className="mt-4 space-y-2">
                      {section.points.map((point) => (
                        <li
                          key={point}
                          className={`rounded-lg border border-[var(--border-soft)] px-3 py-2 text-[15px] leading-7 text-[var(--text-secondary)] ${styles.section}`}
                        >
                          {point}
                        </li>
                      ))}
                    </ul>
                    {section.note ? <p className="mt-3 text-sm text-[var(--text-tertiary)]">{section.note}</p> : null}
                  </div>
                </div>
              </GlassPanel>
            ))}
          </section>
        ) : sectionLayout === "split" ? (
          <section className="mt-10 grid gap-5">
            {sections.map((section, index) => (
              <GlassPanel key={section.title} className="p-6">
                <div className="grid gap-5 md:grid-cols-[0.95fr_1.05fr] md:items-start">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Section {index + 1}</p>
                    <h2 className="mt-2 font-display text-4xl text-[var(--text-primary)]">{section.title}</h2>
                    {section.intro ? <p className="mt-3 text-base leading-7 text-[var(--text-secondary)]">{section.intro}</p> : null}
                  </div>
                  <ul className="space-y-2">
                    {section.points.map((point) => (
                      <li
                        key={point}
                        className={`rounded-lg border border-[var(--border-soft)] px-3 py-2 text-[15px] leading-7 text-[var(--text-secondary)] ${styles.section}`}
                      >
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                {section.note ? <p className="mt-4 text-sm text-[var(--text-tertiary)]">{section.note}</p> : null}
              </GlassPanel>
            ))}
          </section>
        ) : (
          <section className="mt-10 grid gap-5 md:grid-cols-2">
            {sections.map((section) => (
              <GlassPanel key={section.title} className="p-6">
                <h2 className="font-display text-3xl text-[var(--text-primary)]">{section.title}</h2>
                {section.intro ? <p className="mt-2 text-base leading-7 text-[var(--text-secondary)]">{section.intro}</p> : null}
                <ul className="mt-4 space-y-2">
                  {section.points.map((point) => (
                    <li
                      key={point}
                      className={`rounded-lg border border-[var(--border-soft)] px-3 py-2 text-[15px] leading-7 text-[var(--text-secondary)] ${styles.section}`}
                    >
                      {point}
                    </li>
                  ))}
                </ul>
                {section.note ? <p className="mt-3 text-sm text-[var(--text-tertiary)]">{section.note}</p> : null}
              </GlassPanel>
            ))}
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
