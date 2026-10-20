import { Inter, Noto_Nastaliq_Urdu } from "next/font/google";
import { LanguageProvider } from "@/components/language-provider";
import { PageDataProvider } from "@/components/page-data-provider";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const urdu = Noto_Nastaliq_Urdu({
  subsets: ["arabic"],
  weight: ["400", "600"],
  variable: "--font-urdu",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Jamia Al Habib", template: "%s | Jamia Al Habib" },
  description: "Jamia Al Habib Donation Management System",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={`${inter.variable} ${urdu.variable}`}>
      <body>
        <LanguageProvider><PageDataProvider>{children}</PageDataProvider></LanguageProvider>
      </body>
    </html>
  );
}
