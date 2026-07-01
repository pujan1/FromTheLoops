import type { Metadata } from "next";
import { FtlBody } from "@/components/ui";
import { LegalDoc, LegalSection, type LegalSectionDef } from "../../_components/legal-doc";

// Non-copyright removal procedure (sibling to the Terms §7 DMCA flow). Keep the
// legal@ routing intact.
export const metadata: Metadata = {
  title: "Content removal & takedown requests — FromTheLoop",
  description:
    "How to ask us to remove content: confidentiality and NDA concerns, de-anonymisation and personal safety, personal data, and factual disputes. Copyright claims use the DMCA process in our Terms.",
  alternates: { canonical: "/legal/takedown" },
};

const sections: LegalSectionDef[] = [
  { id: "overview", title: "1. What this page is for" },
  { id: "grounds", title: "2. What we act on" },
  { id: "how", title: "3. How to send a request" },
  { id: "process", title: "4. What happens after you send it" },
  { id: "limits", title: "5. Limits and good faith" },
  { id: "contact", title: "6. Contact" },
];

export default function TakedownPage() {
  return (
    <LegalDoc
      title="Content removal & takedown requests"
      updated="2026-06-30"
      sections={sections}
      intro="If content on FromTheLoop needs to come down, this page tells you how to ask. It covers confidentiality, de-anonymisation and safety, personal data, and factual disputes. Copyright claims follow a separate statutory process in our Terms."
    >
      <LegalSection id="overview" title="1. What this page is for">
        <FtlBody>
          FromTheLoop hosts interview experiences written by the people who took
          them. We are the host of that content, not its author. When something
          shouldn&rsquo;t be there, you can ask us to remove or amend it, and we
          review every request a real person sends.
        </FtlBody>
        <FtlBody>
          <strong>Copyright is handled elsewhere.</strong> If your claim is that
          content reproduces material you own the copyright to, use the DMCA
          notice-and-takedown procedure in our{" "}
          <a href="/terms#dmca">Terms of Service, §7</a>, which has its own
          notice, counter-notice, and repeat-infringer rules. This page is for
          everything that is <em>not</em> a copyright claim.
        </FtlBody>
      </LegalSection>

      <LegalSection id="grounds" title="2. What we act on">
        <FtlBody>
          We will review requests to remove or amend content on grounds
          including:
        </FtlBody>
        <ul>
          <li>
            <strong>Confidentiality and NDAs.</strong> Content that discloses
            trade secrets, unreleased products, or specific materials covered by
            a non-disclosure agreement — for example verbatim take-home prompts,
            proprietary questions, or internal documents.
          </li>
          <li>
            <strong>De-anonymisation and personal safety.</strong> Content that
            identifies a specific individual — an interviewer, a candidate, or a
            third party — or that, combined with other detail, would let a
            reasonable reader do so, especially where it creates a risk of harm
            or harassment.
          </li>
          <li>
            <strong>Personal data.</strong> Names, contact details, or other
            personal information published without a lawful basis, including
            requests from a data subject to remove information about themselves.
          </li>
          <li>
            <strong>Factual disputes and defamation.</strong> Statements you
            believe are false and damaging. Tell us specifically what is
            inaccurate; we may correct, annotate, or remove rather than delete
            wholesale.
          </li>
          <li>
            <strong>Other legal or policy grounds.</strong> Anything unlawful, or
            that breaks the rules in our{" "}
            <a href="/terms#acceptable-use">Acceptable use</a> policy.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="how" title="3. How to send a request">
        <FtlBody>
          Email{" "}
          <a href="mailto:legal@fromtheloop.com">legal@fromtheloop.com</a> from
          an address we can reach you at, and include:
        </FtlBody>
        <ol>
          <li>
            the URL (or URLs) of the exact content — a link to the report or the
            specific passage, not just &ldquo;a post on your site&rdquo;;
          </li>
          <li>
            which ground above applies, and a short, specific explanation of the
            problem;
          </li>
          <li>
            what you&rsquo;re asking for — full removal, removal of a specific
            line or detail, or a correction;
          </li>
          <li>
            your name and your relationship to the content (the person named, an
            employer, an authorised representative, or a data subject); and
          </li>
          <li>
            a statement that the information in your request is accurate to the
            best of your knowledge.
          </li>
        </ol>
        <FtlBody>
          If you are asking us to remove information about <em>you</em>, you
          don&rsquo;t need to prove copyright or ownership of anything — just
          point us to it and tell us why.
        </FtlBody>
      </LegalSection>

      <LegalSection id="process" title="4. What happens after you send it">
        <FtlBody>
          We acknowledge requests and aim to make a first decision within a few
          business days; safety-critical de-anonymisation reports are triaged
          ahead of the queue. Depending on the request we may remove the
          content, redact the specific detail at issue, add a correction, or —
          if we don&rsquo;t think removal is warranted — explain why and leave it
          up. We keep an internal record of what we removed and why.
        </FtlBody>
        <FtlBody>
          Because contributions are pseudonymous, we will usually notify the
          person who submitted the content that a removal request affected it,
          without sharing your identifying details unless the law requires it.
        </FtlBody>
      </LegalSection>

      <LegalSection id="limits" title="5. Limits and good faith">
        <FtlBody>
          We aren&rsquo;t able to verify the truth of every experience on the
          platform, and disagreeing with an account is not by itself grounds for
          removal. We weigh a removal request against the value of candidates
          being able to learn from real interview experiences.
        </FtlBody>
        <FtlBody>
          Please send requests in good faith. Submitting a knowingly false or
          abusive takedown — for example to bury an accurate but unflattering
          account — may itself breach our{" "}
          <a href="/terms#acceptable-use">Acceptable use</a> policy.
        </FtlBody>
      </LegalSection>

      <LegalSection id="contact" title="6. Contact">
        <FtlBody>
          Removal and takedown requests:{" "}
          <a href="mailto:legal@fromtheloop.com">legal@fromtheloop.com</a>.
          Copyright claims follow the process in our{" "}
          <a href="/terms#dmca">Terms of Service, §7</a>.
        </FtlBody>
      </LegalSection>
    </LegalDoc>
  );
}
