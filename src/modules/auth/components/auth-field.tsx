"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ComponentProps } from "react";

interface AuthFieldProps extends ComponentProps<"input"> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  isPassword?: boolean;
}

export function AuthField({ id, label, error, hint, isPassword, type, ...props }: AuthFieldProps) {
  const { t } = useLanguage();
  const [isVisible, setIsVisible] = useState(false);
  const describedBy = [error ? `${id}-error` : "", hint ? `${id}-hint` : ""]
    .filter(Boolean).join(" ");

  return (
    <div>
      <label htmlFor={id} className="field-label">{label} {props.required && <span aria-hidden="true">*</span>}</label>
      <div className={isPassword ? "password-field" : undefined}>
        <Input
          {...props}
          id={id}
          type={isPassword ? (isVisible ? "text" : "password") : type}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy || undefined}
        />
        {isPassword && (
          <Button variant="ghost" size="icon" className="password-toggle"
            aria-label={t(isVisible ? "hidePassword" : "showPassword")}
            aria-pressed={isVisible} onClick={() => setIsVisible(!isVisible)}>
            {isVisible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
          </Button>
        )}
      </div>
      {hint && <span id={`${id}-hint`} className="field-hint">{hint}</span>}
      {error && <span id={`${id}-error`} className="field-error" role="alert">{error}</span>}
    </div>
  );
}
