import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import type { VariantProps } from "class-variance-authority";

const buttonVariants = cva("button inline-flex min-h-11 items-center justify-center gap-2.5 rounded-[var(--radius-control)] border border-transparent px-[18px] py-2.5 font-semibold transition-[background,transform,box-shadow] duration-150 enabled:active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-55 aria-busy:cursor-wait aria-busy:opacity-100 aria-busy:before:size-[15px] aria-busy:before:shrink-0 aria-busy:before:animate-spin aria-busy:before:rounded-full aria-busy:before:border-2 aria-busy:before:border-current aria-busy:before:border-e-transparent aria-busy:before:content-[''] aria-busy:[&>svg]:hidden", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]",
      outline: "bg-card border-[var(--input)] text-foreground hover:bg-muted",
      ghost: "bg-transparent text-muted-foreground hover:bg-muted",
    },
    size: { default: "", small: "button-small min-h-[34px] px-2.5 py-1.5 text-xs", icon: "button-icon size-[42px] p-2.5" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({ className, variant, size, asChild, type, loading = false, disabled, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      type={asChild ? undefined : (type ?? "button")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
