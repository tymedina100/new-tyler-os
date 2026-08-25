import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const controlClasses =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClasses, "h-9 py-0", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(controlClasses, "min-h-24 resize-y", className)} {...props} />;
}

/**
 * A styled native select rather than a custom listbox: it is keyboard accessible
 * for free and opens the real picker on a phone, which no custom widget matches.
 */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(controlClasses, "h-9 appearance-none py-0 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  errors?: string[];
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, errors, className, children }: FieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-muted-foreground text-xs font-medium">
        {label}
      </label>
      {children}
      {hint && !errors?.length ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {errors?.length ? (
        <p className="text-destructive text-xs" role="alert">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
