import {ClerkProvider} from "@clerk/nextjs";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Archivo, Geist_Mono } from "next/font/google";
import "./globals.css";

// Swiss Precision: a single neo-grotesque (Archivo) used systematically
// for both display and UI, differentiated only by weight and size.
const display = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--next-font-display",
  display: "swap",
});

const sans = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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

// Base origin for resolving relative canonicals/OG URLs to absolute ones — the
// `alternates.canonical` paths the browse pages set are relative, and a valid
// rel=canonical must be absolute (Lighthouse SEO). Set NEXT_PUBLIC_APP_URL to
// the deployed origin in prod; falls back to localhost for dev/build.
const siteOrigin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: "FromTheLoop — Interview experiences, from the loop",
  description:
    "Structured, taxonomy-aware interview experiences written by the people who took them.",
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
