import type { Metadata } from "next";
import { FtlBody } from "@/components/ui";
import { LegalDoc, LegalSection, type LegalSectionDef } from "../_components/legal-doc";

// First-draft Privacy Policy. The bulk (collection / sharing / rights boilerplate)
// is a placeholder to be replaced by the Termly-generated text on Day 1 of the
// launch sprint — those blocks are marked `TODO(termly)`. The de-anonymisation
// section is hand-written and product-specific; it is NOT something Termly
// generates and must survive the paste-over. See sprint-07-launch-polish.md.

export const metadata: Metadata = {
  title: "Privacy Policy — FromTheLoop",
  description:
    "How FromTheLoop collects, uses, shares, and protects your data — and the controls you have over it.",
  alternates: { canonical: "/privacy" },
};

const sections: LegalSectionDef[] = [
  { id: "scope", title: "1. Who this covers" },
  { id: "collect", title: "2. Information we collect" },
  { id: "use", title: "3. How we use information" },
  { id: "share", title: "4. How we share information" },
  { id: "cookies", title: "5. Cookies and analytics" },
  { id: "retention", title: "6. How long we keep data" },
  { id: "rights", title: "7. Your rights and controls" },
  { id: "anonymity", title: "8. Anonymity and de-anonymisation risk" },
  { id: "security", title: "9. Security" },
  { id: "children", title: "10. Children" },
  { id: "transfers", title: "11. International transfers" },
  { id: "changes", title: "12. Changes to this policy" },
  { id: "contact", title: "13. Contact" },
];

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy Policy"
      updated="2026-06-29"
      sections={sections}
      intro="FromTheLoop is a place to share and read structured interview experiences. This policy explains what we collect, why, who we share it with, and the controls you have — including the unusual privacy questions that come with publishing anonymised accounts of real interviews."
    >
      <LegalSection id="scope" title="1. Who this covers">
        <FtlBody>
          This policy applies to everyone who visits FromTheLoop, reads
          experiences, creates an account, or submits an interview report. By
          using the service you agree to the handling of information described
          here.
        </FtlBody>
        {/* TODO(termly): replace with the generated "Scope / data controller"
            block; keep the product-specific second sentence above. */}
      </LegalSection>

      <LegalSection id="collect" title="2. Information we collect">
        <FtlBody>We collect only what the service needs to work:</FtlBody>
        <ul>
          <li>
            <strong>Account information.</strong> Handled by our authentication
            provider (Clerk): your email, a username, and login metadata. We do
            not store your password.
          </li>
          <li>
            <strong>Content you submit.</strong> The interview experiences,
            comments, reactions, and reports you write, plus the
            company/role/level taxonomy you tag them with.
          </li>
          <li>
            <strong>Usage data.</strong> Standard request logs and aggregate
            analytics (pages viewed, errors encountered) used to keep the site
            running and find bugs.
          </li>
          <li>
            <strong>Communications.</strong> Email we send you (e.g. account or
            moderation notices) and anything you send to our support inbox.
          </li>
        </ul>
        {/* TODO(termly): merge in the generated "Information we collect"
            enumeration (device info, IP, etc.); reconcile with the list above
            rather than duplicating it. */}
      </LegalSection>

      <LegalSection id="use" title="3. How we use information">
        <FtlBody>We use information to:</FtlBody>
        <ul>
          <li>operate the service and publish the experiences you choose to share;</li>
          <li>authenticate you and keep your account secure;</li>
          <li>moderate content and enforce our Terms;</li>
          <li>measure and improve the product in aggregate; and</li>
          <li>contact you about your account or important changes.</li>
        </ul>
        <FtlBody>We do not sell your personal information.</FtlBody>
      </LegalSection>

      <LegalSection id="share" title="4. How we share information">
        <FtlBody>
          We share information only with the service providers that run the
          product on our behalf, each under their own contractual privacy
          obligations:
        </FtlBody>
        <ul>
          <li><strong>Clerk</strong> — authentication and account management.</li>
          <li><strong>Neon</strong> — the application database.</li>
          <li><strong>Cloudflare</strong> — hosting, R2 object storage, and email routing.</li>
          <li><strong>Vercel</strong> — web application hosting.</li>
          <li><strong>Resend</strong> — transactional email delivery.</li>
          <li><strong>Sentry</strong> — error monitoring.</li>
        </ul>
        <FtlBody>
          We may also disclose information where required by law, or to protect
          the rights and safety of our users and the public.
        </FtlBody>
        {/* TODO(termly): align this list with the generated "third parties /
            sub-processors" section. Keep the named providers above current as
            the stack changes — this is the source of truth, not Termly. */}
      </LegalSection>

      <LegalSection id="cookies" title="5. Cookies and analytics">
        <FtlBody>
          We use the cookies strictly necessary to keep you signed in and to
          remember preferences such as your theme. We use privacy-respecting,
          aggregate analytics and do not run third-party advertising trackers.
        </FtlBody>
        {/* TODO(termly): replace with the generated cookie policy / table once
            the analytics vendor is finalised. */}
      </LegalSection>

      <LegalSection id="retention" title="6. How long we keep data">
        <FtlBody>
          We keep account data while your account is active. Published
          experiences may remain on the service after submission, including in
          anonymised aggregate form, even if you later delete your account —
          see the anonymity section below. Moderation and audit records are
          retained as long as needed to operate the service responsibly.
          Evidence attached to reports is purged on a fixed schedule.
        </FtlBody>
      </LegalSection>

      <LegalSection id="rights" title="7. Your rights and controls">
        <FtlBody>
          Depending on where you live, you may have rights to access, correct,
          export, or delete your personal data. We give everyone these controls
          directly:
        </FtlBody>
        <ul>
          <li>
            <strong>Export your data</strong> from{" "}
            <a href="/settings">Settings</a> at any time.
          </li>
          <li>
            <strong>Delete your account</strong> from{" "}
            <a href="/settings/delete">Settings → Delete account</a>.
          </li>
        </ul>
        <FtlBody>
          To exercise any other right, contact us at the address below. We will
          respond within the time required by applicable law.
        </FtlBody>
        {/* TODO(termly): append the jurisdiction-specific GDPR / CPRA rights
            language from the generated policy. */}
      </LegalSection>

      <LegalSection id="anonymity" title="8. Anonymity and de-anonymisation risk">
        <FtlBody>
          FromTheLoop lets you publish interview experiences without attaching
          your name to them. This protects you, but it is not a guarantee of
          anonymity, and you should understand the limits before you submit.
        </FtlBody>
        <ul>
          <li>
            <strong>Content can identify you even when your name is removed.</strong>{" "}
            A specific date, an unusual question, a small team, or a niche role
            can make an experience traceable to one person. Write at the level
            of detail you are comfortable being linked to you.
          </li>
          <li>
            <strong>We retain anonymised content after account deletion.</strong>{" "}
            When you delete your account we remove the link between you and your
            submissions, but the experiences themselves — which are useful to
            future candidates — may remain published in de-identified form. They
            can no longer be exported or edited through your account once that
            link is gone.
          </li>
          <li>
            <strong>We may use your operational data to fight abuse.</strong>{" "}
            We retain the minimum behind-the-scenes signals needed to moderate
            (for example, to act on a confirmed Terms violation), separate from
            the public, name-stripped experience.
          </li>
        </ul>
        <FtlBody>
          If you believe a published experience identifies you against your
          wishes, contact us and we will review it.
        </FtlBody>
      </LegalSection>

      <LegalSection id="security" title="9. Security">
        <FtlBody>
          We use industry-standard measures to protect your data, including
          encryption in transit, scoped access, and signed, short-lived URLs for
          private files. No system is perfectly secure; we cannot guarantee
          absolute security.
        </FtlBody>
      </LegalSection>

      <LegalSection id="children" title="10. Children">
        <FtlBody>
          FromTheLoop is not directed to children under 16, and we do not
          knowingly collect their personal information. If you believe a child
          has provided us data, contact us and we will delete it.
        </FtlBody>
      </LegalSection>

      <LegalSection id="transfers" title="11. International transfers">
        <FtlBody>
          Our service providers may process data in countries other than your
          own. Where required, we rely on appropriate safeguards for those
          transfers.
        </FtlBody>
        {/* TODO(termly): replace with generated SCC / transfer-mechanism text. */}
      </LegalSection>

      <LegalSection id="changes" title="12. Changes to this policy">
        <FtlBody>
          We may update this policy as the product evolves. We will revise the
          “last updated” date above and, for material changes, give notice
          through the service.
        </FtlBody>
      </LegalSection>

      <LegalSection id="contact" title="13. Contact">
        <FtlBody>
          Questions about privacy? Email{" "}
          <a href="mailto:privacy@fromtheloop.com">privacy@fromtheloop.com</a>.
        </FtlBody>
        {/* TODO(termly): confirm the contact address + add the registered
            business name/address the generated policy requires. */}
      </LegalSection>
    </LegalDoc>
  );
}
