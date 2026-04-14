import type { Metadata } from "next";

import { PolicyPage } from "@/components/pages/policy-page";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Billing, Subscription, and Refund Policy | BTA Courtside",
  description:
    "Review BTA Courtside billing terms, subscription renewals, payment handling, cancellations, and refund rules.",
  path: "/billing-refund-policy",
});

export default function BillingRefundPolicyPage(): JSX.Element {
  return (
    <PolicyPage
      eyebrow="Policy Pack"
      title="Billing, Subscription, and Refund Policy"
      summary="This policy governs paid plans, recurring billing, trial conversion, cancellations, and refund treatment for BTA Courtside Intelligence (doing business as Beyond the Arc) at btaintel.com."
      effectiveDate="4/12/26"
      lastUpdated="4/12/26"
      sections={[
        {
          id: "paid-services",
          title: "Paid Services",
          paragraphs: [
            "Some BTA Courtside features require payment. Pricing, plan scope, billing intervals, usage limits, and any included support levels are presented at checkout, in-app, or in a separate order form.",
            "By purchasing a paid plan, you authorize BTA Courtside Intelligence to charge applicable fees and taxes using your selected payment method, subject to this policy and any controlling contract terms.",
          ],
          bullets: [
            "Company: BTA Courtside Intelligence, doing business as Beyond the Arc.",
            "Website: btaintel.com.",
            "General support contact: support@btaintel.com.",
          ],
        },
        {
          id: "renewal",
          title: "Subscription Renewal",
          paragraphs: [
            "Unless otherwise stated in writing, subscriptions renew automatically at the end of each billing term. To avoid future renewal charges, cancel before the next renewal date.",
            "Renewal pricing may change prospectively. If pricing changes materially for existing self-serve subscriptions, reasonable advance notice will be provided before renewal.",
          ],
          bullets: [
            "Automatic renewal applies to monthly and annual plans unless explicitly disabled.",
            "Cancellation stops future renewal charges, not already billed periods.",
            "Enterprise contracts may define separate renewal procedures.",
          ],
        },
        {
          id: "trials-promotions",
          title: "Trials and Promotional Offers",
          paragraphs: [
            "BTA Courtside may offer free trials, introductory pricing, limited-time access, or promotional discounts. Eligibility, duration, conversion behavior, and limitations are determined by offer terms at the time of activation.",
            "Offers may be modified or discontinued at any time to the extent permitted by law.",
          ],
          bullets: [
            "Trials may convert to paid plans unless canceled before trial expiration.",
            "Promotional terms do not guarantee future pricing.",
            "Abuse of trial or promo access may result in restriction or termination.",
          ],
        },
        {
          id: "processing-taxes",
          title: "Payment Processing and Taxes",
          paragraphs: [
            "Payments may be processed by third-party processors. Use of those processors may be subject to separate terms and privacy policies. BTA Courtside does not store full payment card numbers unless explicitly stated.",
            "You are responsible for applicable taxes, duties, or governmental charges except taxes based on BTA Courtside net income.",
          ],
          bullets: [
            "Billing support: support@btaintel.com.",
            "Payment processor disputes should also be reported to BTA support for coordinated resolution.",
            "Tax treatment may vary by jurisdiction and customer type.",
          ],
        },
        {
          id: "late-failed-payments",
          title: "Late or Failed Payments",
          paragraphs: [
            "If a charge fails or an account becomes delinquent, BTA Courtside may retry the payment method, suspend paid features, downgrade access, or terminate the account after applicable notice.",
            "Operational impact from billing suspension may include restricted access to premium analytics, reporting, or administrative functions.",
          ],
          bullets: [
            "Promptly update payment methods to avoid interruption.",
            "Delinquent balances remain due regardless of suspension status.",
            "Chronic non-payment may trigger permanent account termination.",
          ],
        },
        {
          id: "cancellations-refunds",
          title: "Cancellations and Refunds",
          paragraphs: [
            "Unless required by law or explicitly promised in writing, subscription fees are non-refundable once billed. Partial billing periods are not prorated for refund purposes.",
            "No refund is owed for unused time, unused seats, schedule changes, staff turnover, or subjective dissatisfaction where no material service breach has occurred.",
          ],
          bullets: [
            "Cancellation prevents future renewals but does not reverse prior charges.",
            "Custom setup, onboarding, and implementation fees are non-refundable once scheduled or delivered.",
            "Courtesy refunds, if granted, are discretionary unless legally required.",
          ],
        },
        {
          id: "chargebacks-enterprise",
          title: "Chargebacks and Enterprise Terms",
          paragraphs: [
            "If you believe a charge is incorrect, contact support@btaintel.com before initiating a chargeback. We will investigate and respond with transaction details and next steps.",
            "For customers under signed school, team, or enterprise agreements, those written agreements control in the event of a conflict with this page.",
          ],
          bullets: [
            "Fraudulent or abusive chargebacks may result in account suspension.",
            "Enterprise invoicing and payment schedules are governed by contract.",
            "Mailing address: Portland, Oregon, USA 97229.",
          ],
        },
      ]}
    />
  );
}
