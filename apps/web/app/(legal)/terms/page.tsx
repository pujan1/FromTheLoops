import type { Metadata } from "next";
import { FtlBody } from "@/components/ui";
import { LegalDoc, LegalSection, type LegalSectionDef } from "../_components/legal-doc";

// First-draft Terms of Service. The generic contract boilerplate (disclaimers,
// liability, governing law) is placeholder pending the Termly-generated text and
// is marked `TODO(termly)`. The user-generated-content licence and the DMCA /
// notice-and-takedown procedure are hand-written and product-specific: they are
// the legally load-bearing sections for a platform that hosts accounts of real
// interviews, and Termly does not generate them adequately. They must survive
// any paste-over. The DMCA section is deep-linkable for the Day-2 /legal/takedown
// page. See sprint-07-launch-polish.md.

export const metadata: Metadata = {
  title: "Terms of Service — FromTheLoop",
  description:
    "The rules for using FromTheLoop: your account, the content you submit, what's allowed, and how copyright takedowns work.",
  alternates: { canonical: "/terms" },
};

const sections: LegalSectionDef[] = [
  { id: "acceptance", title: "1. Acceptance of these terms" },
  { id: "eligibility", title: "2. Eligibility" },
  { id: "accounts", title: "3. Your account" },
  { id: "ugc", title: "4. Content you submit" },
  { id: "acceptable-use", title: "5. Acceptable use" },
  { id: "moderation", title: "6. Moderation and removal" },
  { id: "dmca", title: "7. Copyright and takedowns (DMCA)" },
  { id: "karma", title: "8. Karma and reputation" },
  { id: "our-ip", title: "9. Our intellectual property" },
  { id: "disclaimers", title: "10. Disclaimers" },
  { id: "liability", title: "11. Limitation of liability" },
  { id: "indemnity", title: "12. Indemnification" },
  { id: "termination", title: "13. Termination" },
  { id: "law", title: "14. Governing law" },
  { id: "changes", title: "15. Changes to these terms" },
  { id: "contact", title: "16. Contact" },
];

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of Service"
      updated="2026-06-29"
      sections={sections}
      intro="These terms govern your use of FromTheLoop. Because the service is built around sharing real interview experiences, please read the sections on the content you submit and on copyright takedowns carefully — they carry the most weight for both you and us."
    >
      <LegalSection id="acceptance" title="1. Acceptance of these terms">
        <FtlBody>
          By accessing or using FromTheLoop you agree to these Terms and to our{" "}
          <a href="/privacy">Privacy Policy</a>. If you do not agree, do not use
          the service.
        </FtlBody>
      </LegalSection>

      <LegalSection id="eligibility" title="2. Eligibility">
        <FtlBody>
          You must be at least 16 years old and able to form a binding contract
          to use FromTheLoop. By using it you confirm that you meet these
          requirements.
        </FtlBody>
      </LegalSection>

      <LegalSection id="accounts" title="3. Your account">
        <FtlBody>
          You are responsible for activity under your account and for keeping
          your login secure. Provide accurate information and let us know
          promptly of any unauthorised use. You may delete your account at any
          time from <a href="/settings/delete">Settings</a>.
        </FtlBody>
      </LegalSection>

      {/* ── Load-bearing, hand-written. Do not let a Termly paste overwrite. ── */}
      <LegalSection id="ugc" title="4. Content you submit">
        <FtlBody>
          “Content” means anything you submit: interview experiences, comments,
          reactions, reports, and taxonomy tags. You keep ownership of your
          Content. The following terms let us run the service and protect
          everyone who relies on it.
        </FtlBody>

        <FtlBody>
          <strong>Licence to us.</strong> You grant FromTheLoop a worldwide,
          non-exclusive, royalty-free, sublicensable licence to host, store,
          reproduce, adapt, publish, and display your Content for the purpose of
          operating and promoting the service — including in anonymised and
          aggregated form. This licence continues for Content that remains
          published after you delete your account, as described in our Privacy
          Policy.
        </FtlBody>

        <FtlBody>
          <strong>Your promises about Content.</strong> By submitting Content you
          represent that:
        </FtlBody>
        <ul>
          <li>
            it is truthful and reflects your own genuine experience, not
            fabricated or second-hand as if first-hand;
          </li>
          <li>
            you are not breaching any non-disclosure agreement, employment
            agreement, or other confidentiality obligation by sharing it;
          </li>
          <li>
            it does not disclose another person’s confidential, proprietary, or
            personal information, trade secrets, or protected materials (for
            example, copyrighted assessment questions taken from an employer);
          </li>
          <li>
            it does not name, defame, harass, or single out an individual
            interviewer or employee; and
          </li>
          <li>
            you have all rights necessary to grant the licence above.
          </li>
        </ul>
        <FtlBody>
          Share what an interview was <em>like</em> — its shape, difficulty, and
          themes — not verbatim confidential materials. When in doubt, leave it
          out.
        </FtlBody>

        <FtlBody>
          <strong>No verification; accuracy disclaimer.</strong> Experiences are
          submitted by users and are not verified by us. They may be incomplete,
          out of date, or wrong, and they reflect individual perspectives, not
          the position of any employer. Do not treat them as the only basis for
          a decision.
        </FtlBody>

        <FtlBody>
          <strong>Our role.</strong> We act as a host of user content. We are not
          obligated to monitor Content, but we may review, moderate, refuse, or
          remove it at our discretion — see Moderation below. We are not the
          author of your Content and do not adopt it as our own.
        </FtlBody>
      </LegalSection>

      <LegalSection id="acceptable-use" title="5. Acceptable use">
        <FtlBody>You agree not to:</FtlBody>
        <ul>
          <li>post unlawful, defamatory, harassing, or deceptive Content;</li>
          <li>
            disclose confidential or proprietary materials, or breach an NDA or
            other obligation you owe;
          </li>
          <li>impersonate others or misrepresent your affiliation;</li>
          <li>
            scrape, spam, or attempt to circumvent rate limits, security, or
            moderation;
          </li>
          <li>
            submit content that infringes someone else’s intellectual property
            or privacy rights; or
          </li>
          <li>use the service to do anything illegal.</li>
        </ul>
      </LegalSection>

      <LegalSection id="moderation" title="6. Moderation and removal">
        <FtlBody>
          We may remove Content, limit features, or suspend accounts that
          violate these Terms. Anyone can report Content through the in-product
          report tools. We aim to act on reports promptly, but we do not promise
          any particular response time and we make moderation decisions at our
          discretion. We keep records of moderation actions for accountability.
        </FtlBody>
      </LegalSection>

      {/* ── Load-bearing, hand-written. The /legal/takedown page (Day 2) deep
          links here; keep the #dmca anchor stable. ── */}
      <LegalSection id="dmca" title="7. Copyright and takedowns (DMCA)">
        <FtlBody>
          We respect intellectual property rights and respond to clear notices
          of claimed infringement. If you believe Content on FromTheLoop
          infringes your copyright, send a written notice to our designated
          agent at{" "}
          <a href="mailto:legal@fromtheloop.com">legal@fromtheloop.com</a>{" "}
          including:
        </FtlBody>
        <ol>
          <li>your physical or electronic signature;</li>
          <li>
            identification of the copyrighted work you claim has been infringed;
          </li>
          <li>
            the URL or enough detail to let us locate the allegedly infringing
            Content;
          </li>
          <li>your name, address, and contact information;</li>
          <li>
            a statement that you have a good-faith belief the use is not
            authorised by the owner, its agent, or the law; and
          </li>
          <li>
            a statement, under penalty of perjury, that the information is
            accurate and that you are the owner or authorised to act on the
            owner’s behalf.
          </li>
        </ol>
        <FtlBody>
          We will remove or disable access to Content that is the subject of a
          valid notice and will notify the person who submitted it.
        </FtlBody>
        <FtlBody>
          <strong>Counter-notice.</strong> If your Content was removed and you
          believe that was a mistake or misidentification, you may send a
          counter-notice to the same address with your signature, identification
          of the removed Content and its prior location, a statement under
          penalty of perjury that you have a good-faith belief it was removed in
          error, and your consent to jurisdiction as the law requires.
        </FtlBody>
        <FtlBody>
          <strong>Repeat infringers.</strong> We terminate the accounts of users
          who repeatedly infringe in appropriate circumstances.
        </FtlBody>
        <FtlBody>
          For non-copyright removal requests — for example, a confidentiality or
          de-anonymisation concern — use the procedure on our{" "}
          <a href="/legal/takedown">takedown page</a>.
        </FtlBody>
        {/* TODO(termly): if Termly emits a fuller DMCA block with a registered
            agent address, fold it in here — but keep this notice/counter-notice/
            repeat-infringer structure and the legal@ routing intact. */}
      </LegalSection>

      <LegalSection id="karma" title="8. Karma and reputation">
        <FtlBody>
          Karma and similar reputation signals reflect community activity. They
          have no monetary value, cannot be bought, sold, or transferred, and we
          may adjust or reset them to keep the system fair.
        </FtlBody>
      </LegalSection>

      <LegalSection id="our-ip" title="9. Our intellectual property">
        <FtlBody>
          The FromTheLoop name, design, software, and the structure and
          compilation of the experiences on the service are owned by us or our
          licensors and are protected by law. These Terms do not grant you any
          right to our trademarks or branding.
        </FtlBody>
      </LegalSection>

      <LegalSection id="disclaimers" title="10. Disclaimers">
        <FtlBody>
          The service and all Content are provided “as is” and “as available”
          without warranties of any kind, whether express or implied, including
          fitness for a particular purpose and non-infringement. We do not
          warrant that the service will be uninterrupted or error-free, or that
          any experience is accurate or complete.
        </FtlBody>
        {/* TODO(termly): replace with the generated warranty-disclaimer clause. */}
      </LegalSection>

      <LegalSection id="liability" title="11. Limitation of liability">
        <FtlBody>
          To the maximum extent permitted by law, FromTheLoop will not be liable
          for any indirect, incidental, special, consequential, or punitive
          damages, or for any loss arising from your reliance on Content or your
          use of the service.
        </FtlBody>
        {/* TODO(termly): replace with the generated limitation-of-liability and
            damages-cap clause, reviewed for our jurisdiction. */}
      </LegalSection>

      <LegalSection id="indemnity" title="12. Indemnification">
        <FtlBody>
          You agree to indemnify and hold FromTheLoop harmless from claims and
          costs arising out of your Content or your breach of these Terms —
          including a claim that your Content breached a confidentiality
          obligation or infringed someone’s rights.
        </FtlBody>
      </LegalSection>

      <LegalSection id="termination" title="13. Termination">
        <FtlBody>
          You may stop using the service at any time and delete your account. We
          may suspend or terminate access if you violate these Terms or to
          protect the service and its users. Sections that by their nature should
          survive termination — including the content licence, disclaimers, and
          limitation of liability — will survive.
        </FtlBody>
      </LegalSection>

      <LegalSection id="law" title="14. Governing law">
        <FtlBody>
          These Terms are governed by the laws of the jurisdiction in which
          FromTheLoop operates, without regard to conflict-of-law rules.
        </FtlBody>
        {/* TODO(termly): set the specific governing law + venue once the
            operating entity/jurisdiction is finalised. */}
      </LegalSection>

      <LegalSection id="changes" title="15. Changes to these terms">
        <FtlBody>
          We may update these Terms as the product evolves. We will revise the
          “last updated” date above and, for material changes, give notice
          through the service. Continued use after a change means you accept the
          updated Terms.
        </FtlBody>
      </LegalSection>

      <LegalSection id="contact" title="16. Contact">
        <FtlBody>
          Questions about these Terms? Email{" "}
          <a href="mailto:legal@fromtheloop.com">legal@fromtheloop.com</a>.
        </FtlBody>
        {/* TODO(termly): add the registered business name/address the generated
            terms require. */}
      </LegalSection>
    </LegalDoc>
  );
}
