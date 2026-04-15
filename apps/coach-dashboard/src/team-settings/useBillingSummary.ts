import { useEffect, useState } from "react";
import { fetchBillingEntitlement, type BillingEntitlement } from "../platform.js";
import { buildBillingStatusMessage } from "./helpers.js";
import type { SettingsSection } from "./types.js";

export function useBillingSummary(activeSection: SettingsSection) {
  const [billingEntitlement, setBillingEntitlement] = useState<BillingEntitlement | null>(null);
  const [billingStatus, setBillingStatus] = useState("Open Billing from Stripe to manage your plan, payment method, and invoices.");
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingLoadFailed, setBillingLoadFailed] = useState(false);
  const [billingRefreshKey, setBillingRefreshKey] = useState(0);

  useEffect(() => {
    if (activeSection !== "billing") {
      return;
    }

    let cancelled = false;

    async function loadBillingSummary() {
      setBillingLoading(true);
      setBillingLoadFailed(false);
      setBillingStatus("Loading billing status...");

      try {
        const entitlement = await fetchBillingEntitlement();
        if (cancelled) {
          return;
        }

        setBillingEntitlement(entitlement);
        setBillingLoadFailed(!entitlement);
        setBillingStatus(buildBillingStatusMessage(entitlement));
      } catch {
        if (!cancelled) {
          setBillingEntitlement(null);
          setBillingLoadFailed(true);
          setBillingStatus("Could not load billing status. Open Billing from Stripe to retry.");
        }
      } finally {
        if (!cancelled) {
          setBillingLoading(false);
        }
      }
    }

    void loadBillingSummary();
    return () => {
      cancelled = true;
    };
  }, [activeSection, billingRefreshKey]);

  function refreshBilling() {
    setBillingRefreshKey((value) => value + 1);
  }

  return {
    billingEntitlement,
    billingStatus,
    billingLoading,
    billingLoadFailed,
    refreshBilling,
  };
}
