import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

interface BadgeProps extends ComponentProps<"span"> {
  tone?: "success" | "warning" | "neutral" | "danger";
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return <span className={cn("badge", `badge-${tone}`, className)} {...props} />;
}
