import { SignUp } from "@clerk/nextjs";

// The Smart CAPTCHA and the Terms/Privacy consent checkbox are configured in the
// Clerk dashboard (Configure → Legal), not here — <SignUp /> renders both itself.
export default function SignUpPage() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <SignUp />
    </div>
  );
}
