// Submission-confirmed email — V1's only transactional notification.
//
// Built as an inline-styled HTML string (not a rendered React component): Next
// forbids importing react-dom/server into the server-action graph, and email
// clients want plain, inline-styled markup anyway. The web action renders this
// and enqueues { to, subject, html, text } onto the notifications queue; the
// worker sends it via Resend.

export interface SubmissionConfirmedProps {
  companyName: string;
  roleName: string;
  // Absolute URL to the report's owner view (where Edit/Delete live).
  reportUrl: string;
  // Whole hours left in the 24h edit window at send time.
  editHoursLeft: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// Minimal HTML escape for the few interpolated values (company/role names are
// user-influenced taxonomy labels; the URL is app-built but escaped anyway).
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSubmissionConfirmedEmail(
  props: SubmissionConfirmedProps,
): RenderedEmail {
  const { companyName, roleName, reportUrl, editHoursLeft } = props;
  const hours = `${editHoursLeft} ${editHoursLeft === 1 ? "hour" : "hours"}`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;background-color:#f5f3ee;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:520px;margin:0 auto;background-color:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e1d8;">
      <p style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#7a7468;margin:0 0 8px;">FromTheLoop</p>
      <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;">Thanks — your interview report is in.</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">It&rsquo;s now in review and visible only to you until it clears moderation.</p>
      <p style="font-size:15px;font-weight:600;margin:0 0 24px;">${esc(companyName)} &middot; ${esc(roleName)}</p>
      <a href="${esc(reportUrl)}" style="display:inline-block;background-color:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600;">View your report</a>
      <p style="font-size:13px;color:#7a7468;margin:24px 0 0;line-height:1.6;">You can edit it for the next ${hours}; after that you can still delete it. If you didn&rsquo;t submit this, you can ignore this email.</p>
    </div>
  </body>
</html>`;

  const text = [
    "Thanks — your interview report is in.",
    "",
    "It's now in review and visible only to you until it clears moderation.",
    "",
    `${companyName} · ${roleName}`,
    "",
    `View your report: ${reportUrl}`,
    "",
    `You can edit it for the next ${hours}; after that you can still delete it.`,
  ].join("\n");

  return {
    subject: `Your ${companyName} interview report is in`,
    html,
    text,
  };
}
