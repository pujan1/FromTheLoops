"use client";

// Discard control for a draft row. A client component purely so it can interpose
// a confirm() before the server action fires — discarding throws away
// in-progress work, so an accidental click shouldn't be silent. The action
// (discardDraftAction) re-checks auth + ownership, so this guard is UX, not
// security.

import { FtlButton } from "@/components/ui";
import { discardDraftAction } from "./actions";

export function DiscardDraftButton({
  draftId,
  label,
  confirmText,
}: {
  draftId: string;
  label: string;
  confirmText: string;
}) {
  return (
    <form
      action={discardDraftAction}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="draftId" value={draftId} />
      <FtlButton type="submit" variant="ghost" size="sm">
        {label}
      </FtlButton>
    </form>
  );
}
