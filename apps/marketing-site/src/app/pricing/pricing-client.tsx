"use client";

import Link from "next/link";
import { Check } from "lucide-react";

import { AmbientGrid } from "@/components/sections/ambient-grid";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { GlassPanel } from "@/components/ui/glass-panel";

type Plan = {
  name: string;
  monthly: number;
  summary: string;
  features: string[];
  featured?: boolean;
};

const plans: Plan[] = [
  {
    name: "Courtside Platform",
    monthly: 199,
    summary: "One complete platform plan for live game operations, coaching workflow, and postgame review.",
    features: [
      "1 team workspace",
      "Live possession tracking + corrections",
      "Coach dashboard and core reports",
      "Clip-linked timeline review",
      "Email support",
    ],
    featured: true,
  },
];

function formatPrice(value: number): string {
  return value.toLocaleString("en-US");
}

export function PricingClientPage(): JSX.Element {
  return (
    <>
      <AmbientGrid />
      <Navbar />
      <main id="main-content" className="mx-auto w-[min(1240px,94vw)] py-14 md:py-18">
        <section className="rounded-3xl border border-[var(--border-soft)] bg-[linear-gradient(135deg,#2B235C_0%,#4636C9_45%,#6E5BFF_100%)] px-7 py-10 md:px-12 md:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[rgba(247,248,252,0.82)]">Plans and Pricing</p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl font-semibold leading-[0.95] text-[var(--text-primary)] md:text-7xl">
            One clear plan for your sideline workflow.
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-[rgba(247,248,252,0.9)]">
            Clear pricing, real operational value, and zero guesswork. Start with one team or roll out across your entire program.
          </p>

          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-[rgba(247,248,252,0.22)] bg-[rgba(13,16,32,0.4)] px-4 py-2">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Monthly and Yearly Plans</span>
            <span className="text-sm font-semibold text-[var(--accent-signal)]">From $199/mo</span>
          </div>
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-1">
          {plans.map((plan) => (
            <GlassPanel
              key={plan.name}
              className={`mx-auto w-full max-w-2xl p-7 ${plan.featured ? "border-[var(--accent-primary)] shadow-[0_0_0_1px_rgba(110,91,255,0.35),0_22px_52px_rgba(8,10,24,0.62)]" : ""}`}
            >
              {plan.featured ? (
                <p className="mb-4 inline-flex rounded-full border border-[rgba(70,215,255,0.38)] bg-[rgba(70,215,255,0.16)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent-secondary)]">
                  Most Popular
                </p>
              ) : null}

              <h2 className="font-display text-3xl font-semibold text-[var(--text-primary)]">{plan.name}</h2>
              <p className="mt-2 min-h-[72px] text-base leading-7 text-[var(--text-secondary)]">{plan.summary}</p>

              <div className="mt-6 flex items-end gap-2">
                <span className="text-xl font-semibold text-[var(--text-secondary)]">$</span>
                <span className="font-display text-6xl font-semibold leading-none text-[var(--text-primary)]">{formatPrice(plan.monthly)}</span>
                <span className="mb-1 text-xl text-[var(--text-tertiary)]">/mo</span>
              </div>
              <p className="mt-2 text-sm text-[var(--text-tertiary)]">Choose monthly or yearly billing at checkout</p>
              <p className="mt-1 text-xs text-[var(--accent-secondary)]">No demo required. Checkout and signup are self-serve.</p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Link
                  href="/get-started?cycle=monthly"
                  className={`inline-flex w-full items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                    plan.featured
                      ? "border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-on)] hover:bg-[#7C6BFF]"
                      : "border-[var(--border-soft)] bg-[rgba(28,35,64,0.9)] text-[var(--text-primary)] hover:bg-[rgba(35,44,79,0.95)]"
                  }`}
                >
                  Start Monthly Signup
                </Link>
                <Link
                  href="/get-started?cycle=yearly"
                  className={`inline-flex w-full items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                    plan.featured
                      ? "border-[var(--border-soft)] bg-transparent text-[var(--text-primary)] hover:bg-[rgba(28,35,64,0.9)]"
                      : "border-[var(--border-soft)] bg-[rgba(28,35,64,0.9)] text-[var(--text-primary)] hover:bg-[rgba(35,44,79,0.95)]"
                  }`}
                >
                  Start Yearly Signup
                </Link>
              </div>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-[var(--text-secondary)]">
                    <Check className="mt-0.5 size-4 shrink-0 text-[var(--accent-success)]" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </GlassPanel>
          ))}
        </section>

        <section className="mt-10 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-1)] p-6 md:p-8">
          <h3 className="font-display text-3xl font-semibold text-[var(--text-primary)]">Need a custom rollout?</h3>
          <p className="mt-3 max-w-3xl text-[var(--text-secondary)]">
            If you need district-wide deployment, custom implementation planning, or contract alignment with school procurement, we can scope an enterprise package.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/contact"
              className="inline-flex rounded-lg border border-[var(--accent-primary)] bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-on)] hover:bg-[#7C6BFF]"
            >
              Talk to Sales
            </Link>
            <Link
              href="/get-started"
              className="inline-flex rounded-lg border border-[var(--border-soft)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[rgba(28,35,64,0.9)]"
            >
              Self-Serve Signup
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
