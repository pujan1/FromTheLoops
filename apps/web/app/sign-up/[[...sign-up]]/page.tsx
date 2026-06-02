import { SignUp } from "@clerk/nextjs";

// Account creation is the captcha boundary for the whole app (Sprint 1 Day 8):
// /submit is auth-gated, so anyone who can submit a report has first cleared
// Clerk's Smart CAPTCHA (Turnstile) here. The prebuilt <SignUp /> renders and
// manages that widget itself — bot protection is toggled in the Clerk
// dashboard, so there's no captcha markup to add on this page (a custom
// useSignUp() flow would need an explicit <div id="clerk-captcha" />). The
// submit form carries its own honeypot for surface-level anti-abuse; see
// packages/shared/src/anti-abuse.ts.
export default function SignUpPage() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <SignUp />
    </div>
  );
}
