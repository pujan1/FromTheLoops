"use client";

import { HONEYPOT_FIELD } from "@fromtheloop/shared";
import { forwardRef, useId } from "react";

// Off-screen decoy input bots auto-fill but humans never reach. Read by ref at
// save time; the server action drops any write where it comes back non-empty.
const hidden = {
  position: "absolute",
  left: "-9999px",
  top: 0,
  width: 1,
  height: 1,
  overflow: "hidden",
} as const;

export const Honeypot = forwardRef<HTMLInputElement>(function Honeypot(_, ref) {
  const id = useId();
  return (
    <div style={hidden} aria-hidden="true">
      <label htmlFor={id}>Website</label>
      <input
        ref={ref}
        id={id}
        type="text"
        name={HONEYPOT_FIELD}
        tabIndex={-1}
        autoComplete="off"
        defaultValue=""
      />
    </div>
  );
});
