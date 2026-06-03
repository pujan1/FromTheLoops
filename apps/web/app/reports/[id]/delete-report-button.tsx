"use client";

// The soft-delete control. A client component purely so it can interpose a
// confirm() before the server action fires — deletion is one-way for the user
// (only an admin can restore), so an accidental click shouldn't be terminal.
// The action itself (softDeleteReportAction) re-checks auth + ownership, so
// this guard is UX, not security.

import { FtlButton } from "@/components/ui";
import { softDeleteReportAction } from "./actions";

export function DeleteReportButton({
  reportId,
  label,
  confirmText,
}: {
  reportId: string;
  label: string;
  confirmText: string;
}) {
  return (
    <form
      action={softDeleteReportAction}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="reportId" value={reportId} />
      <FtlButton type="submit" variant="ghost">
        {label}
      </FtlButton>
    </form>
  );
}
