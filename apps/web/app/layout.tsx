import {ClerkProvider} from "@clerk/nextjs";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Geist, Geist_Mono } from "next/font/google";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { siteOrigin } from "@/lib/site";
import { SiteFooterGate } from "./_components/site-footer-gate";
import "./globals.css";

const display = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--next-font-display",
  display: "swap",
});

const sans = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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

const siteTitle = "FromTheLoop — Interview experiences, from the loop";
const siteDescription =
  "Structured, taxonomy-aware interview experiences written by the people who took them.";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  // No title.template: pages already suffix "— FromTheLoop" themselves.
  title: siteTitle,
  description: siteDescription,
  applicationName: "FromTheLoop",
  openGraph: {
    type: "website",
    siteName: "FromTheLoop",
    title: siteTitle,
    description: siteDescription,
    url: siteOrigin,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Inline so it runs before paint and sets data-theme before the
            stylesheet applies, preventing FOUC. beforeInteractive runs too late. */}
        <script
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body>
        <ClerkProvider>
          <NextIntlClientProvider>
            <ImpersonationBanner />
            {children}
            <SiteFooterGate />
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
