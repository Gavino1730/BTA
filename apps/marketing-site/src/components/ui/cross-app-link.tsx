"use client";

import Link from "next/link";

interface CrossAppLinkProps {
  href: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

let navigatingOut = false;

function beginExternalTransition(href: string) {
  if (navigatingOut) {
    return;
  }

  navigatingOut = true;
  document.body.classList.add("app-exit-to-external");

  window.setTimeout(() => {
    window.location.assign(href);
  }, 210);
}

export function CrossAppLink({ href, className, children, onClick }: CrossAppLinkProps): JSX.Element {
  return (
    <Link
      href={href}
      className={className}
      prefetch={false}
      onClick={(event) => {
        onClick?.();

        if (
          event.defaultPrevented
          || event.button !== 0
          || event.metaKey
          || event.ctrlKey
          || event.shiftKey
          || event.altKey
        ) {
          return;
        }

        event.preventDefault();
        beginExternalTransition(href);
      }}
    >
      {children}
    </Link>
  );
}
