import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/metadata";
import { GetStartedClientPage } from "./start-client";

export const metadata: Metadata = buildPageMetadata({
  title: "Get Started | BTA Courtside",
  description:
    "Sign in or create your BTA Courtside coach account to get started.",
  path: "/get-started",
});

export default function GetStartedPage(): JSX.Element {
  return <GetStartedClientPage />;
}
