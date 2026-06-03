import { SignUp } from "@clerk/nextjs";

// Account creation is the captcha boundary for the whole app: /submit is
// auth-gated, so anyone who can submit a report has first cleared Clerk's
// Smart CAPTCHA here. The prebuilt <SignUp /> renders and manages that widget
// itself (toggled in the Clerk dashboard), so there's no captcha markup to add.
// The submit form carries its own honeypot — see packages/shared/src/anti-abuse.ts.
export default function SignUpPage() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <SignUp />
    </div>
  );
}
