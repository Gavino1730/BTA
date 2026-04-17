"use client";

import { useMemo } from "react";

import { AmbientGrid } from "@/components/sections/ambient-grid";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { GlassPanel } from "@/components/ui/glass-panel";
import { CrossAppLink } from "@/components/ui/cross-app-link";
import { getDashboardLoginUrl } from "@/lib/site-url";

export function GetStartedClientPage(): JSX.Element {
  const loginUrl = useMemo(() => getDashboardLoginUrl(), []);

  return (
    <>
      <AmbientGrid />
      <Navbar />
      <main id="main-content" className="mx-auto w-[min(1120px,92vw)] py-14 md:py-18">
        <section className="rounded-3xl border border-(--border-soft) bg-[linear-gradient(135deg,#2B235C_0%,#4636C9_45%,#6E5BFF_100%)] px-7 py-10 md:px-12 md:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[rgba(247,248,252,0.82)]">Access Your Account</p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl font-semibold leading-[0.95] text-(--text-primary) md:text-7xl">
            Get started with BTA Courtside.
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-[rgba(247,248,252,0.9)]">
            Sign in to your existing account or create a new one to get started.
          </p>
        </section>

        <section className="mt-8 grid gap-5 sm:grid-cols-2">
          <GlassPanel className="flex flex-col gap-4 p-7">
            <h2 className="font-display text-2xl text-(--text-primary)">Sign In</h2>
            <p className="text-sm leading-6 text-(--text-secondary)">
              Already have a BTA Courtside account? Sign in to your coach dashboard.
            </p>
            <CrossAppLink
              href={loginUrl}
              className="mt-auto inline-flex items-center justify-center rounded-xl border border-(--accent-primary) bg-(--accent-primary) px-4 py-3 text-sm font-semibold text-(--accent-on) transition hover:bg-[#7C6BFF]"
            >
              Sign In to Dashboard
            </CrossAppLink>
          </GlassPanel>

          <GlassPanel className="flex flex-col gap-4 p-7">
            <h2 className="font-display text-2xl text-(--text-primary)">Create Account</h2>
            <p className="text-sm leading-6 text-(--text-secondary)">
              New to BTA Courtside? Create your coach account and set up your team.
            </p>
            <CrossAppLink
              href={loginUrl}
              className="mt-auto inline-flex items-center justify-center rounded-xl border border-(--border-soft) bg-transparent px-4 py-3 text-sm font-semibold text-(--text-primary) transition hover:bg-[rgba(28,35,64,0.9)]"
            >
              Create Account
            </CrossAppLink>
          </GlassPanel>
        </section>
      </main>
      <Footer />
    </>
  );
}
