"use client";

// Styleguide-only demo for a dismissible <FtlNotice>. The onDismiss handler
// needs client state, so it lives here rather than on the server page. Not
// shipped outside the styleguide route.

import { useState } from "react";
import { FtlBody, FtlButton, FtlNotice } from "@/components/ui";

export function DismissibleNoticeDemo() {
  const [show, setShow] = useState(true);
  if (!show) {
    return (
      <FtlButton variant="ghost" onClick={() => setShow(true)}>
        Restore dismissed notice
      </FtlButton>
    );
  }
  return (
    <FtlNotice tone="info" onDismiss={() => setShow(false)}>
      <FtlBody size="small">
        Autosave is on. Your draft is kept as you type — no need to submit to
        come back later.
      </FtlBody>
    </FtlNotice>
  );
}
