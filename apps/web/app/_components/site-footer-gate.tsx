"use client";

import { usePathname } from "next/navigation";
import { FtlSiteFooter } from "@/components/ui";

const HIDDEN_PREFIXES = ["/admin", "/sign-in", "/sign-up"];

export function SiteFooterGate() {
  const pathname = usePathname();
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }
  return <FtlSiteFooter />;
}
