"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { motion } from "motion/react";

import { navLinks } from "@/content/homepage";
import { buttonVariants } from "@/components/ui/button";
import { CrossAppLink } from "@/components/ui/cross-app-link";
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
      <div className="relative rounded-2xl border border-(--border-soft) bg-[rgba(13,16,32,0.72)] px-5 py-3 backdrop-blur-xl md:px-7">
        <div className="absolute inset-0 bg-[radial-gradient(130%_160%_at_14%_0%,rgba(110,91,255,0.14),transparent_42%),linear-gradient(180deg,rgba(70,215,255,0.06),transparent_55%)]" />
        <nav className="relative flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5" aria-label="BTA Courtside home">
            <img src="/brand-icon.png" alt="BTA Courtside" className="h-8 w-auto md:h-9" />
            <span className="hidden font-display text-sm text-(--text-primary) md:block">
              BTA Courtside
            </span>
          </Link>

          <div className="hidden items-center gap-8 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <CrossAppLink
              href={dashboardLoginUrl}
              className={cn(
                buttonVariants({ variant: "ghost", size: "md" }),
                "hidden md:inline-flex"
              )}
            >
              Login
            </CrossAppLink>
            <Link
              href="/demo-signup"
              className={cn(
                buttonVariants({ variant: "secondary", size: "md" }),
                "hidden md:inline-flex"
              )}
            >
              Watch Demo
            </Link>
            <Link href="/get-started" className={buttonVariants({ size: "md" })}>
              Get Started
            </Link>
            <button
              type="button"
              onClick={() => setIsOpen((prev) => !prev)}
              className="inline-grid size-10 place-items-center rounded-lg border border-(--border-soft) bg-[rgba(28,35,64,0.85)] text-(--text-primary) lg:hidden"
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
          <div className="rounded-xl border border-(--border-soft) bg-(--panel-2) p-3">
            <div className="grid gap-1">
              <Link
                href="/get-started"
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--panel-1)"
              >
                Get Started
              </Link>
              <CrossAppLink
                href={dashboardLoginUrl}
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--panel-1)"
              >
                Login
              </CrossAppLink>
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-(--text-secondary) transition-colors hover:bg-(--panel-1) hover:text-(--text-primary)"
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
