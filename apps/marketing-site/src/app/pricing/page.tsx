import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/metadata";
import { PricingClientPage } from "./pricing-client";

export const metadata: Metadata = buildPageMetadata({
  title: "Plans and Pricing | BTA Courtside",
  description:
    "Compare BTA Courtside plans for teams and programs with clear monthly and annual pricing.",
  path: "/pricing",
});

export default function PricingPage(): JSX.Element {
  return <PricingClientPage />;
}
