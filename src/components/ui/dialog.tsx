"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
  busy?: boolean;
}

export function Dialog({ open, onOpenChange, title, description, children, className, busy = false }: DialogProps) {
  const { t } = useLanguage();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(value) => { if (!busy || value) onOpenChange(value); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />
        <DialogPrimitive.Content className={cn("fixed top-1/2 left-1/2 z-[51] flex max-h-[calc(100dvh-2rem)] w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card p-2 shadow-[var(--shadow-popover)]", className)} aria-busy={busy || undefined}
          onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}>
          <div className="shrink-0 px-5 pt-4 pb-4 pe-12">
            <DialogPrimitive.Title className="text-[21px] font-[650]">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-3 text-muted-foreground leading-[1.7]">{description}</DialogPrimitive.Description>
          </div>
          <div className="min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl px-5 pb-5 [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)] hover:[&::-webkit-scrollbar-thumb]:bg-[var(--emerald-400)]">
            {children}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon" disabled={busy} className="absolute top-3 end-3 z-10" aria-label={t("close")}>
              <X size={18} aria-hidden="true" />
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
