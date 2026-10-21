import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

interface BadgeProps extends ComponentProps<"span"> {
  tone?: "success" | "warning" | "neutral" | "danger";
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  const tones = {
    success: "bg-[var(--success-soft)] text-[var(--success)]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
    neutral: "bg-muted text-muted-foreground",
    danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
  };
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-[var(--radius-control)] px-2.5 py-1 text-[11px] font-medium", tones[tone], className)} {...props} />;
}
