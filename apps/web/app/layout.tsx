import {ClerkProvider} from "@clerk/nextjs";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { DM_Sans, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const display = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--next-font-display",
  display: "swap",
});

const sans = Geist({
  subsets: ["latin"],
  variable: "--next-font-sans",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--next-font-mono",
  display: "swap",
});

const themeInitScript = `
(function () {
  try {
    var stored = window.localStorage.getItem("fromtheloop-theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = stored === "light" || stored === "dark" ? stored : (prefersDark ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {}
})();
`;

export const metadata: Metadata = {
  title: "FromTheLoop — Interview reports, from the loop",
  description:
    "Structured, taxonomy-aware interview reports written by the people who took them.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // next-intl: locale is resolved by i18n/request.ts (fixed "en" for V1).
  // NextIntlClientProvider streams the message catalog to client components;
  // server components read it via getTranslations.
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Inline so it runs before paint and sets data-theme before the
            stylesheet applies, preventing FOUC on hard reloads. next/script
            with beforeInteractive runs too late for this. */}
        <script
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body>
        <ClerkProvider>
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}