"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
import { motion } from "motion/react";

import { navLinks } from "@/content/homepage";
import { Button } from "@/components/ui/button";

const productItems = [
  "Live possession tracking",
  "Bench-side dashboard",
  "Film cue synchronization",
  "AI recommendation stream",
] as const;

export function Navbar(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="sticky top-3 z-50 mx-auto w-[min(1200px,92vw)]"
    >
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[color:var(--panel-1)]/90 px-5 py-3 backdrop-blur-xl md:px-7">
        <div className="absolute inset-0 bg-[radial-gradient(120%_150%_at_10%_0%,rgba(79,109,255,0.18),transparent_45%)]" />
        <nav className="relative flex items-center justify-between gap-4">
          <Link href="#" className="flex items-center gap-2">
            <span className="inline-grid size-8 place-items-center rounded-lg border border-[var(--border-soft)] bg-[var(--panel-2)] text-sm font-semibold text-[var(--accent-primary)]">
              BTA
            </span>
            <span className="font-medium tracking-wide text-[var(--text-primary)]">Courtside</span>
          </Link>

          <div className="hidden items-center gap-8 lg:flex">
            <div className="group relative">
              <button className="flex items-center gap-1 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
                Product
                <ChevronDown className="size-4" />
              </button>
              <div className="pointer-events-none absolute left-1/2 top-full w-72 -translate-x-1/2 pt-4 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
                <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--panel-1)] p-3 shadow-[var(--shadow-lg)]">
                  {productItems.map((item) => (
                    <div key={item} className="rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--panel-2)] hover:text-[var(--text-primary)]">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" className="hidden md:inline-flex">
              Watch Demo
            </Button>
            <Button>Book a Session</Button>
            <button
              type="button"
              onClick={() => setIsOpen((prev) => !prev)}
              className="inline-grid size-10 place-items-center rounded-lg border border-[var(--border-soft)] bg-[var(--panel-2)] text-[var(--text-primary)] lg:hidden"
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
            <div className="mb-2 grid gap-1">
              {productItems.map((item) => (
                <p
                  key={item}
                  className="rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)]"
                >
                  {item}
                </p>
              ))}
            </div>
            <div className="h-px bg-[var(--border-soft)]" />
            <div className="mt-2 grid gap-1">
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
