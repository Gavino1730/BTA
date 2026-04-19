import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/metadata";
import { PricingClientPage } from "./pricing-client";

export const metadata: Metadata = buildPageMetadata({
  title: "Pricing | Plans for Teams and Programs",
  description:
    "Compare BTA Courtside plans for high school, AAU, and club basketball programs. Transparent monthly and annual pricing for teams of all sizes.",
  path: "/pricing",
});

export default function PricingPage(): JSX.Element {
  return <PricingClientPage />;
}
