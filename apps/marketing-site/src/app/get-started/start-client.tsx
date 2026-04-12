"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AmbientGrid } from "@/components/sections/ambient-grid";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { GlassPanel } from "@/components/ui/glass-panel";
import { CrossAppLink } from "@/components/ui/cross-app-link";
import { getApiBaseUrl, getDashboardLoginUrl } from "@/lib/site-url";

type PlanCycle = "monthly" | "yearly";

interface BootstrapCheckoutResponse {
  url?: string;
  error?: string;
}

export function GetStartedClientPage(): JSX.Element {
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const initialCycle = (params.get("cycle") ?? "").trim().toLowerCase() === "yearly" ? "yearly" : "monthly";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [planCycle, setPlanCycle] = useState<PlanCycle>(initialCycle);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("Enter your details to start checkout. No demo request required.");

  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const loginUrl = useMemo(() => getDashboardLoginUrl(), []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedName || !normalizedEmail) {
      setStatus("Full name and email are required.");
      return;
    }

    setSubmitting(true);
    setStatus("Starting secure checkout...");

    try {
      const response = await fetch(`${apiBase}/api/billing/bootstrap-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: normalizedName,
          email: normalizedEmail,
          schoolName: schoolName.trim() || undefined,
          teamName: teamName.trim() || undefined,
          planCycle,
        }),
      });

      const payload = await response.json() as BootstrapCheckoutResponse;
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Could not start checkout.");
      }

      window.location.assign(payload.url);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start checkout.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <AmbientGrid />
      <Navbar />
      <main id="main-content" className="mx-auto w-[min(1120px,92vw)] py-14 md:py-18">
        <section className="rounded-3xl border border-[var(--border-soft)] bg-[linear-gradient(135deg,#2B235C_0%,#4636C9_45%,#6E5BFF_100%)] px-7 py-10 md:px-12 md:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[rgba(247,248,252,0.82)]">Self-Serve Signup</p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl font-semibold leading-[0.95] text-[var(--text-primary)] md:text-7xl">
            Start BTA Courtside now.
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-[rgba(247,248,252,0.9)]">
            Choose a plan, complete secure Stripe checkout, then create your coach account and finish setup.
          </p>
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <GlassPanel className="p-7">
            <h2 className="font-display text-3xl text-[var(--text-primary)]">Checkout Details</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">This starts your subscription flow. Account creation continues after checkout.</p>

            <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
              <label className="text-sm text-[var(--text-secondary)]">
                Full Name
                <input
                  className="mt-2 w-full rounded-xl border border-[var(--border-soft)] bg-[rgba(21,26,48,0.9)] px-3 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Head coach name"
                  autoComplete="name"
                  required
                />
              </label>

              <label className="text-sm text-[var(--text-secondary)]">
                Email
                <input
                  className="mt-2 w-full rounded-xl border border-[var(--border-soft)] bg-[rgba(21,26,48,0.9)] px-3 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="coach@school.org"
                  autoComplete="email"
                  type="email"
                  required
                />
              </label>

              <label className="text-sm text-[var(--text-secondary)]">
                School Name (Optional)
                <input
                  className="mt-2 w-full rounded-xl border border-[var(--border-soft)] bg-[rgba(21,26,48,0.9)] px-3 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                  value={schoolName}
                  onChange={(event) => setSchoolName(event.target.value)}
                  placeholder="Valley Catholic"
                />
              </label>

              <label className="text-sm text-[var(--text-secondary)]">
                Team Name (Optional)
                <input
                  className="mt-2 w-full rounded-xl border border-[var(--border-soft)] bg-[rgba(21,26,48,0.9)] px-3 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                  value={teamName}
                  onChange={(event) => setTeamName(event.target.value)}
                  placeholder="Varsity Boys Basketball"
                />
              </label>

              <label className="text-sm text-[var(--text-secondary)]">
                Plan
                <select
                  className="mt-2 w-full rounded-xl border border-[var(--border-soft)] bg-[rgba(21,26,48,0.9)] px-3 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                  value={planCycle}
                  onChange={(event) => setPlanCycle(event.target.value === "yearly" ? "yearly" : "monthly")}
                >
                  <option value="monthly">Monthly - $199/mo</option>
                  <option value="yearly">Yearly - $1999/yr</option>
                </select>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 inline-flex items-center justify-center rounded-xl border border-[var(--accent-primary)] bg-[var(--accent-primary)] px-4 py-3 text-sm font-semibold text-[var(--accent-on)] transition hover:bg-[#7C6BFF] disabled:cursor-not-allowed disabled:opacity-65"
              >
                {submitting ? "Redirecting to Checkout..." : "Continue to Secure Checkout"}
              </button>

              <p className="text-sm text-[var(--text-tertiary)]" aria-live="polite">{status}</p>
            </form>
          </GlassPanel>

          <GlassPanel className="p-7">
            <h3 className="font-display text-2xl text-[var(--text-primary)]">What happens next</h3>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-7 text-[var(--text-secondary)]">
              <li>Complete Stripe checkout for monthly or yearly subscription.</li>
              <li>Return to setup with your secure school scope prefilled.</li>
              <li>Create your coach account and finish team onboarding.</li>
            </ol>

            <div className="mt-6 rounded-xl border border-[var(--border-soft)] bg-[rgba(21,26,48,0.9)] p-4">
              <p className="text-sm text-[var(--text-secondary)]">Already have an account?</p>
              <CrossAppLink
                href={loginUrl}
                className="mt-2 inline-flex rounded-lg border border-[var(--border-soft)] bg-transparent px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[rgba(28,35,64,0.9)]"
              >
                Go to Coach Login
              </CrossAppLink>
            </div>
          </GlassPanel>
        </section>
      </main>
      <Footer />
    </>
  );
}
