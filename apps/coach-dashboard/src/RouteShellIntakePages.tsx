import { type FormEvent, useState } from "react";
import { Button, FormField, Panel, SectionHeader, StatusMessage } from "../../shared-ui/components/index.js";
import { apiBase, apiKeyHeader } from "./platform.js";
import type { RoutedPageProps } from "./RouteShellShared.js";

interface IntakeFieldConfig {
  key: string;
  label: string;
  type?: string;
  placeholder?: string;
  fullSpan?: boolean;
  as?: "input" | "textarea" | "select";
  options?: Array<{ value: string; label: string }>;
}

interface IntakePageProps extends RoutedPageProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  endpoint: string;
  initialStatus: string;
  submittingStatus: string;
  successStatus: string;
  validationStatus: string;
  fields: IntakeFieldConfig[];
  values: Record<string, string>;
  setValue: (key: string, value: string) => void;
  primaryLabel: string;
  secondaryLabel: string;
  onSecondary: () => void;
}

function IntakePage({
  eyebrow,
  title,
  subtitle,
  endpoint,
  initialStatus,
  submittingStatus,
  successStatus,
  validationStatus,
  fields,
  values,
  setValue,
  primaryLabel,
  secondaryLabel,
  onSecondary,
}: IntakePageProps) {
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const [tone, setTone] = useState<"success" | "error" | "info">("info");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hasRequiredContent = fields
      .filter((field) => field.key === "email" || field.key === "message" || field.key === "name" || field.key === "fullName")
      .every((field) => values[field.key]?.trim());

    if (!hasRequiredContent) {
      setTone("error");
      setStatus(validationStatus);
      return;
    }

    setSubmitting(true);
    setTone("info");
    setStatus(submittingStatus);

    try {
      const response = await fetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify(values),
      });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) {
        setTone("error");
        setStatus(typeof payload.error === "string" ? payload.error : "Could not submit request.");
        return;
      }

      setTone("success");
      setStatus(successStatus);
      fields
        .filter((field) => field.as === "textarea")
        .forEach((field) => setValue(field.key, ""));
    } catch {
      setTone("error");
      setStatus("Could not reach the API. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stats-page">
      <Panel className="stats-page-card policy-page-hero" tone="violet" padding="lg">
        <SectionHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
      </Panel>

      <Panel as="form" className="stats-page-card policy-page-section bta-intake-form" padding="lg" onSubmit={handleSubmit}>
        <div className="setup-grid">
          {fields.map((field) => (
            <FormField
              key={field.key}
              as={field.as === "textarea" || field.as === "select" ? field.as : "input"}
              label={field.label}
              type={field.type}
              placeholder={field.placeholder}
              value={values[field.key]}
              onChange={(event) => setValue(field.key, event.currentTarget.value)}
              className="stats-filter-field"
              fullSpan={field.fullSpan}
            >
              {field.as === "select"
                ? field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))
                : undefined}
            </FormField>
          ))}
        </div>

        <StatusMessage
          message={status}
          type={tone === "error" ? "error" : tone === "success" ? "success" : "info"}
          className="stats-page-status"
        />

        <div className="policy-page-actions">
          <Button type="submit" disabled={submitting} className="shell-nav-link shell-nav-link-active">
            {submitting ? `${primaryLabel}...` : primaryLabel}
          </Button>
          <Button type="button" variant="secondary" className="shell-nav-link" onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

export function SupportPage({ onNavigate }: RoutedPageProps) {
  const [values, setValues] = useState({
    fullName: "",
    email: "",
    topic: "help",
    severity: "medium",
    message: "",
  });

  return (
    <IntakePage
      onNavigate={onNavigate}
      eyebrow="Support"
      title="Support Intake"
      subtitle="Send game-day issues, bugs, and help requests."
      endpoint="/api/intake/support"
      initialStatus="Use this form to submit support incidents and get an email confirmation."
      submittingStatus="Submitting support intake..."
      successStatus="Support request submitted. Check your email for confirmation."
      validationStatus="Email and message are required."
      primaryLabel="Submit Support"
      secondaryLabel="Open Contact"
      onSecondary={() => onNavigate("/contact")}
      values={values}
      setValue={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
      fields={[
        { key: "fullName", label: "Name", placeholder: "Your name" },
        { key: "email", label: "Email", type: "email", placeholder: "you@school.org" },
        {
          key: "topic",
          label: "Type",
          as: "select",
          options: [
            { value: "help", label: "Help" },
            { value: "bug", label: "Bug" },
            { value: "feature", label: "Feature" },
          ],
        },
        {
          key: "severity",
          label: "Severity",
          as: "select",
          options: [
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
          ],
        },
        {
          key: "message",
          label: "Details",
          as: "textarea",
          placeholder: "Describe what happened and when.",
          fullSpan: true,
        },
      ]}
    />
  );
}

export function ContactPage({ onNavigate }: RoutedPageProps) {
  const [values, setValues] = useState({
    name: "",
    email: "",
    organization: "",
    category: "support",
    message: "",
  });

  return (
    <IntakePage
      onNavigate={onNavigate}
      eyebrow="Contact"
      title="Contact BTA"
      subtitle="General and operational requests."
      endpoint="/api/intake/contact"
      initialStatus="Contact us for support, onboarding, billing, or security questions."
      submittingStatus="Submitting contact request..."
      successStatus="Contact request submitted. Check your email for confirmation."
      validationStatus="Name, email, and message are required."
      primaryLabel="Send"
      secondaryLabel="Book Demo"
      onSecondary={() => onNavigate("/book-demo")}
      values={values}
      setValue={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
      fields={[
        { key: "name", label: "Name" },
        { key: "email", label: "Email", type: "email" },
        { key: "organization", label: "Organization" },
        {
          key: "category",
          label: "Category",
          as: "select",
          options: [
            { value: "support", label: "Support" },
            { value: "onboarding", label: "Onboarding" },
            { value: "billing", label: "Billing" },
            { value: "security", label: "Security" },
          ],
        },
        { key: "message", label: "Message", as: "textarea", fullSpan: true },
      ]}
    />
  );
}

export function DemoBookingPage({ onNavigate }: RoutedPageProps) {
  const [values, setValues] = useState({
    fullName: "",
    email: "",
    organization: "",
    details: "",
  });

  return (
    <IntakePage
      onNavigate={onNavigate}
      eyebrow="Demo"
      title="Book A Demo"
      subtitle="Tell us about your team and timeline."
      endpoint="/api/intake/demo"
      initialStatus="Request a demo and we will follow up with scheduling details."
      submittingStatus="Submitting demo request..."
      successStatus="Demo request submitted. Check your email for confirmation."
      validationStatus="Name and email are required."
      primaryLabel="Request Demo"
      secondaryLabel="Back to Contact"
      onSecondary={() => onNavigate("/contact")}
      values={values}
      setValue={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
      fields={[
        { key: "fullName", label: "Name" },
        { key: "email", label: "Email", type: "email" },
        { key: "organization", label: "Organization" },
        { key: "details", label: "Details", as: "textarea", fullSpan: true },
      ]}
    />
  );
}

export function DataDeletionPage({ onNavigate }: RoutedPageProps) {
  const [values, setValues] = useState({
    fullName: "",
    email: "",
    details: "",
  });

  return (
    <IntakePage
      onNavigate={onNavigate}
      eyebrow="Data Request"
      title="Data Deletion Request"
      subtitle="Submit compliance and account data deletion requests."
      endpoint="/api/intake/data-deletion"
      initialStatus="Submit a data deletion request and we will confirm via email."
      submittingStatus="Submitting request..."
      successStatus="Data deletion request submitted. Check your email for confirmation."
      validationStatus="Name and email are required."
      primaryLabel="Submit Request"
      secondaryLabel="Contact"
      onSecondary={() => onNavigate("/contact")}
      values={values}
      setValue={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
      fields={[
        { key: "fullName", label: "Name" },
        { key: "email", label: "Email", type: "email" },
        { key: "details", label: "Scope / Notes", as: "textarea", fullSpan: true },
      ]}
    />
  );
}
