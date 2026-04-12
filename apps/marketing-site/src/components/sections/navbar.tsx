"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { motion } from "motion/react";

import { navLinks } from "@/content/homepage";
import { buttonVariants } from "@/components/ui/button";
import { getDashboardLoginUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

export function Navbar(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const dashboardLoginUrl = getDashboardLoginUrl();

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="sticky top-3 z-50 mx-auto w-[min(1200px,92vw)]"
    >
      <div className="relative rounded-2xl border border-[rgba(255,247,255,0.2)] bg-[rgba(69,54,138,0.82)] px-5 py-3 backdrop-blur-xl md:px-7">
        <div className="absolute inset-0 bg-[radial-gradient(120%_150%_at_10%_0%,rgba(255,255,255,0.08),transparent_38%),linear-gradient(180deg,rgba(39,29,88,0.12),transparent)]" />
        <nav className="relative flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="inline-grid size-8 place-items-center rounded-lg border border-[rgba(255,247,255,0.22)] bg-[rgba(255,255,255,0.12)] text-sm font-semibold text-[var(--text-primary)]">
              BTA
            </span>
            <span className="font-medium tracking-wide text-[var(--text-primary)]">Courtside</span>
          </Link>

          <div className="hidden items-center gap-8 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-[rgba(255,249,255,0.88)] transition-colors hover:text-[var(--text-primary)]"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={dashboardLoginUrl}
              className={cn(
                buttonVariants({ variant: "ghost", size: "md" }),
                "hidden border-[rgba(255,247,255,0.22)] bg-[rgba(255,255,255,0.08)] md:inline-flex"
              )}
            >
              Login
            </Link>
            <Link
              href="/demo-signup"
              className={cn(
                buttonVariants({ variant: "ghost", size: "md" }),
                "hidden border-[rgba(255,247,255,0.22)] bg-[rgba(255,255,255,0.08)] md:inline-flex"
              )}
            >
              Watch Demo
            </Link>
            <Link href="/contact" className={buttonVariants({ size: "md" })}>
              Book a Session
            </Link>
            <button
              type="button"
              onClick={() => setIsOpen((prev) => !prev)}
              className="inline-grid size-10 place-items-center rounded-lg border border-[rgba(255,247,255,0.22)] bg-[rgba(255,255,255,0.08)] text-[var(--text-primary)] lg:hidden"
              aria-label="Toggle menu"
              aria-expanded={isOpen}
            >
              {isOpen ? <X className="size-4.5" /> : <Menu className="size-4.5" />}
            </button>
          </div>
        </nav>

        <motion.div
          initial={false}
          animate={{
            height: isOpen ? "auto" : 0,
            opacity: isOpen ? 1 : 0,
            marginTop: isOpen ? 12 : 0,
          }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="overflow-hidden lg:hidden"
        >
          <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--panel-2)] p-3">
            <div className="grid gap-1">
              <Link
                href={dashboardLoginUrl}
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--panel-1)]"
              >
                Login
              </Link>
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--panel-1)] hover:text-[var(--text-primary)]"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.header>
  );
}
