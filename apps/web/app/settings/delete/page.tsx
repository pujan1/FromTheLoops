import { currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import {
  FtlBody,
  FtlButton,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlField,
  FtlInput,
  FtlLinkButton,
  FtlNotice,
  FtlRule,
  FtlSiteHeader,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import { deleteAccountAction } from "../actions";
import styles from "../settings.module.css";

export const metadata: Metadata = {
  title: "Delete account — FromTheLoop",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// /settings/delete — the deliberate confirmation screen for the irreversible
// account-delete. Its own route (not a modal on /settings) so the destructive
// action is never a stray click. Requires the user to type DELETE; the server
// action re-checks that token before doing anything.
export default async function DeleteAccountPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await currentUser();
  if (!user) {
    throw new Error(
      "settings/delete: middleware did not gate unauthenticated request",
    );
  }

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer width="prose">
          <FtlEyebrow tone="accent">settings · delete account</FtlEyebrow>
          <FtlDisplay as="h1" size="lg" style={{ marginTop: 24 }}>
            Delete your account
          </FtlDisplay>

          <FtlNotice tone="danger" className={styles.notice}>
            This can’t be undone.
          </FtlNotice>

          <FtlBody tone="muted" style={{ marginTop: 16 }}>
            Deleting your account will:
          </FtlBody>
          <ul className={styles.dangerList}>
            <li>Remove all your reports from public view immediately.</li>
            <li>Discard any in-progress drafts.</li>
            <li>Sign you out everywhere.</li>
            <li>
              Permanently scrub your personal information and free-text content
              after a 90-day window.
            </li>
          </ul>

          {error === "confirm" && (
            <FtlNotice tone="warning" className={styles.notice}>
              Type DELETE exactly to confirm.
            </FtlNotice>
          )}

          <FtlRule />

          <form action={deleteAccountAction} className={styles.form}>
            <FtlField label="Type DELETE to confirm">
              {(id) => (
                <FtlInput
                  id={id}
                  name="confirm"
                  autoComplete="off"
                  placeholder="DELETE"
                  required
                />
              )}
            </FtlField>

            <div className={styles.formActions}>
              <FtlButton type="submit" variant="primary">
                Permanently delete my account
              </FtlButton>
              <FtlLinkButton href={routes.settings} variant="ghost">
                Cancel
              </FtlLinkButton>
            </div>
          </form>
        </FtlContainer>
      </main>
    </>
  );
}
