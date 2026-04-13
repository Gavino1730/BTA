import Link from "next/link";

import { AmbientGrid } from "@/components/sections/ambient-grid";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { GlassPanel } from "@/components/ui/glass-panel";

type PolicySection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

type PolicyPageProps = {
  eyebrow: string;
  title: string;
  summary: string;
  effectiveDate: string;
  lastUpdated: string;
  sections: PolicySection[];
};

export function PolicyPage({
  eyebrow,
  title,
  summary,
  effectiveDate,
  lastUpdated,
  sections,
}: PolicyPageProps): JSX.Element {
  return (
    <>
      <AmbientGrid />
      <Navbar />
      <main id="main-content" className="mx-auto w-[min(1200px,92vw)] py-16 md:py-20">
        <section className="rounded-3xl border border-[var(--border-soft)] bg-[linear-gradient(140deg,rgba(13,16,32,0.96),rgba(43,35,92,0.9),rgba(70,54,201,0.5))] px-7 py-8 md:px-10 md:py-10">
          <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">{eyebrow}</p>
          <h1 className="mt-3 max-w-5xl font-display text-5xl leading-[0.96] text-[var(--text-primary)] md:text-7xl">{title}</h1>
          <p className="mt-4 max-w-4xl text-lg leading-8 text-[var(--text-secondary)] md:text-xl">{summary}</p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full border border-[var(--border-soft)] bg-[rgba(21,26,48,0.94)] px-4 py-1.5 text-[var(--text-secondary)]">Effective: {effectiveDate}</span>
            <span className="rounded-full border border-[var(--border-soft)] bg-[rgba(21,26,48,0.94)] px-4 py-1.5 text-[var(--text-secondary)]">Updated: {lastUpdated}</span>
            <Link
              href="mailto:support@btaintel.com"
              className="rounded-full border border-[var(--accent-primary-dark)] bg-[var(--accent-primary)] px-4 py-1.5 font-semibold text-[var(--accent-on)]"
            >
              Support Contact
            </Link>
          </div>
        </section>

        <section className="mt-10 grid gap-5 lg:grid-cols-[0.34fr_0.66fr]">
          <GlassPanel className="h-fit p-6 lg:sticky lg:top-24">
            <h2 className="font-display text-3xl text-[var(--text-primary)]">On This Page</h2>
            <ol className="mt-4 space-y-2 text-sm">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block rounded-lg border border-[var(--border-soft)] bg-[rgba(21,26,48,0.92)] px-3 py-2 text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                  >
                    {index + 1}. {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </GlassPanel>

          <div className="space-y-5">
            {sections.map((section, index) => (
              <GlassPanel key={section.id} className="p-6" >
                <article id={section.id}>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Section {index + 1}</p>
                  <h3 className="mt-2 font-display text-4xl text-[var(--text-primary)]">{section.title}</h3>
                  <div className="mt-4 space-y-4 text-base leading-8 text-[var(--text-secondary)]">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                  {section.bullets && section.bullets.length > 0 ? (
                    <ul className="mt-5 space-y-2">
                      {section.bullets.map((bullet) => (
                        <li
                          key={bullet}
                          className="rounded-lg border border-[var(--border-soft)] bg-[rgba(21,26,48,0.92)] px-3 py-2 text-[15px] leading-7 text-[var(--text-secondary)]"
                        >
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              </GlassPanel>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
