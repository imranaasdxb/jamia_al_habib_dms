import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input type={type} className={cn("input", className)} {...props} />;
}
