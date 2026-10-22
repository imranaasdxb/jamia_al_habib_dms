"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function Input({ className, type = "text", onKeyDown, onWheel, ...props }: ComponentProps<"input">) {
  return <input type={type} className={cn("input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]", type === "number" && "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0", className)} {...props}
    onKeyDown={(event) => {
      onKeyDown?.(event);
      if (type === "number" && ["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) event.preventDefault();
    }}
    onWheel={(event) => {
      onWheel?.(event);
      if (type === "number" && !event.defaultPrevented) event.currentTarget.blur();
    }} />;
}
