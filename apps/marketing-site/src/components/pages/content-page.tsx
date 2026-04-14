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
    hero: "bg-[linear-gradient(135deg,#2B235C_0%,#4636C9_45%,#6E5BFF_100%)]",
    chip: "bg-[rgba(28,35,64,0.92)]",
    section: "bg-[rgba(21,26,48,0.92)]",
  },
  pulse: {
    hero: "bg-[linear-gradient(140deg,rgba(13,16,32,0.95),rgba(43,35,92,0.88),rgba(70,215,255,0.2))]",
    chip: "bg-[rgba(21,26,48,0.94)]",
    section: "bg-[rgba(21,26,48,0.9)]",
  },
  horizon: {
    hero: "bg-[linear-gradient(140deg,rgba(13,16,32,0.96),rgba(43,35,92,0.9),rgba(70,54,201,0.55))]",
    chip: "bg-[rgba(28,35,64,0.9)]",
    section: "bg-[rgba(21,26,48,0.92)]",
  },
  ember: {
    hero: "bg-[linear-gradient(140deg,rgba(13,16,32,0.95),rgba(70,54,201,0.58),rgba(255,184,77,0.22))]",
    chip: "bg-[rgba(28,35,64,0.9)]",
    section: "bg-[rgba(21,26,48,0.9)]",
  },
  sprint: {
    hero: "bg-[linear-gradient(140deg,rgba(13,16,32,0.96),rgba(43,35,92,0.86),rgba(56,227,159,0.26))]",
    chip: "bg-[rgba(28,35,64,0.9)]",
    section: "bg-[rgba(21,26,48,0.9)]",
  },
  support: {
    hero: "bg-[linear-gradient(140deg,rgba(13,16,32,0.96),rgba(43,35,92,0.9),rgba(70,215,255,0.22))]",
    chip: "bg-[rgba(28,35,64,0.9)]",
    section: "bg-[rgba(21,26,48,0.9)]",
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
              className="inline-flex items-center rounded-full border border-[var(--accent-primary-dark)] bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-on)] transition hover:bg-[#7C6BFF]"
            >
              {primaryCta.label}
            </Link>
            {secondaryCta ? (
              <Link
                href={secondaryCta.href}
                className="inline-flex items-center rounded-full border border-[var(--border-soft)] bg-transparent px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[rgba(28,35,64,0.9)]"
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
                  <div className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[rgba(21,26,48,0.92)] text-sm font-semibold text-[var(--text-primary)]">
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
