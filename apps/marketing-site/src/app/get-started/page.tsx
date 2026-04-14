import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/metadata";
import { GetStartedClientPage } from "./start-client";

export const metadata: Metadata = buildPageMetadata({
  title: "Get Started | BTA Courtside",
  description:
    "Start your BTA Courtside subscription and launch your coach account directly from checkout.",
  path: "/get-started",
});

export default function GetStartedPage(): JSX.Element {
  return <GetStartedClientPage />;
}
