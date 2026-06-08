import { currentUser } from "@clerk/nextjs/server";
import { getDb, getOrCreateUserByClerkId } from "@fromtheloop/db";
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
  FtlSelect,
  FtlSiteHeader,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import { updateSettingsAction } from "./actions";
import styles from "./settings.module.css";

export const metadata: Metadata = {
  title: "Settings — FromTheLoop",
  // Private surface; keep it out of search results.
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// /settings — the signed-in user's account controls: public display name, the
// default attribution new submissions start with, a data export, and the
// account-delete entry point. Middleware gates the route, so currentUser() is
// non-null here. Not indexable. Fully SSR; the forms post to server actions.
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await currentUser();
  if (!user) {
    throw new Error("settings: middleware did not gate unauthenticated request");
  }

  const params = await searchParams;
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;

  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer width="prose">
          <FtlEyebrow tone="accent">settings</FtlEyebrow>
          <FtlDisplay as="h1" size="lg" style={{ marginTop: 24 }}>
            Account settings
          </FtlDisplay>
          <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
            Control how you appear, how new reports are attributed, and your
            data.
          </FtlBody>

          {saved && (
            <FtlNotice tone="success" className={styles.notice}>
              Settings saved.
            </FtlNotice>
          )}
          {error === "name-too-long" && (
            <FtlNotice tone="danger" className={styles.notice}>
              That display name is too long (max 80 characters).
            </FtlNotice>
          )}

          <FtlRule />

          {/* Profile + attribution defaults */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Profile</h2>
            <form action={updateSettingsAction} className={styles.form}>
              <FtlField
                label="Display name"
                error={undefined}
              >
                {(id) => (
                  <FtlInput
                    id={id}
                    name="displayName"
                    defaultValue={internal.displayName ?? ""}
                    maxLength={80}
                    placeholder="Shown on reports you attribute to yourself"
                    autoComplete="off"
                  />
                )}
              </FtlField>
              <p className={styles.hint}>
                Leave blank to show your username instead. Anonymous reports
                never show this.
              </p>

              <FtlField label="Default attribution for new reports">
                {(id) => (
                  <FtlSelect
                    id={id}
                    name="defaultDisplayAttribution"
                    defaultValue={internal.defaultDisplayAttribution}
                  >
                    <option value="anonymous">
                      Anonymous (recommended)
                    </option>
                    <option value="display_name">Show my display name</option>
                  </FtlSelect>
                )}
              </FtlField>
              <p className={styles.hint}>
                You can still change attribution per report when you submit.
                Posting anonymously still credits your karma — it’s
                account-bound.
              </p>

              <div className={styles.formActions}>
                <FtlButton type="submit" variant="primary">
                  Save changes
                </FtlButton>
              </div>
            </form>
          </section>

          <FtlRule />

          {/* Data export */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Your data</h2>
            <FtlBody tone="muted" style={{ marginTop: 8 }}>
              Download everything you’ve authored — reports, drafts, and
              verification status — as a JSON file.
            </FtlBody>
            <div className={styles.formActions}>
              {/* A plain anchor (not Link): the route streams a file download,
                  not a client navigation. download hints the filename. */}
              <a
                href={routes.exportData}
                download="fromtheloop-export.json"
                className={styles.downloadLink}
              >
                Export my data
              </a>
            </div>
          </section>

          <FtlRule />

          {/* Danger zone */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Danger zone</h2>
            <FtlBody tone="muted" style={{ marginTop: 8 }}>
              Deleting your account removes your reports from public view and
              signs you out. Free-text content is permanently scrubbed after 90
              days. This can’t be undone.
            </FtlBody>
            <div className={styles.formActions}>
              <FtlLinkButton href={routes.settingsDelete} variant="ghost">
                Delete my account
              </FtlLinkButton>
            </div>
          </section>
        </FtlContainer>
      </main>
    </>
  );
}
