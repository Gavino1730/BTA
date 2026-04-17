"use client";

import { useEffect } from "react";

import { getDashboardLoginUrl } from "@/lib/site-url";

export function GetStartedClientPage(): JSX.Element {
  useEffect(() => {
    window.location.replace(getDashboardLoginUrl());
  }, []);

  return <></>;
}
