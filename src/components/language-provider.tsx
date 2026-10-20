"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { english, urdu } from "@/lib/i18n/messages";
import type { ReactNode } from "react";
import type { Language, MessageKey } from "@/lib/i18n/messages";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");
  const messages = language === "ur" ? urdu : english;

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ur" ? "rtl" : "ltr";
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: (key) => messages[key] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return context;
}

export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="language-switch" aria-label="English / اردو">
      {(["en", "ur"] as const).map((value) => (
        <button
          key={value}
          type="button"
          lang={value}
          aria-pressed={language === value}
          onClick={() => setLanguage(value)}
        >
          {value === "en" ? "English" : "اردو"}
        </button>
      ))}
    </div>
  );
}
