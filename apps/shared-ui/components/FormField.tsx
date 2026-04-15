import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import type { ReactNode } from "react";
import { cx } from "./cx";

interface BaseFieldProps {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  /** span 2 columns in a 2-col grid */
  fullSpan?: boolean;
}

interface InputFieldProps extends BaseFieldProps, InputHTMLAttributes<HTMLInputElement> {
  as?: "input";
}
interface SelectFieldProps extends BaseFieldProps, SelectHTMLAttributes<HTMLSelectElement> {
  as: "select";
  children: ReactNode;
}
interface TextareaFieldProps extends BaseFieldProps, TextareaHTMLAttributes<HTMLTextAreaElement> {
  as: "textarea";
}

type FormFieldProps = InputFieldProps | SelectFieldProps | TextareaFieldProps;

export function FormField(props: FormFieldProps) {
  const { label, hint, error, className = "", fullSpan, as: asElement, ...rest } = props;

  const wrapClass = cx("bta-field", fullSpan && "bta-field-full", error && "bta-field-invalid", className);

  return (
    <label className={wrapClass}>
      <span className="bta-field-label">{label}</span>
      {asElement === "select" ? (
        <select {...(rest as SelectHTMLAttributes<HTMLSelectElement>)}>
          {(props as SelectFieldProps).children}
        </select>
      ) : asElement === "textarea" ? (
        <textarea {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} />
      ) : (
        <input {...(rest as InputHTMLAttributes<HTMLInputElement>)} />
      )}
      {hint && !error && <span className="bta-field-hint">{hint}</span>}
      {error && <span className="bta-field-error">{error}</span>}
    </label>
  );
}
