import {
  FtlBody,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlLinkButton,
  FtlRule,
  FtlSiteHeader,
  FtlTag,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import styles from "../placeholder-page.module.css";

type PlaceholderPageProps = {
  eyebrow: string;
  title: string;
  body: string;
  tags: string[];
};

export function PlaceholderPage({ eyebrow, title, body, tags }: PlaceholderPageProps) {
  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer width="prose">
          <FtlEyebrow tone="accent">{eyebrow}</FtlEyebrow>
          <FtlDisplay as="h1" size="xl" style={{ marginTop: 24 }}>
            {title}
          </FtlDisplay>
          <FtlBody size="lead" tone="muted" style={{ marginTop: 24 }}>
            {body}
          </FtlBody>
          <div className={styles.tags}>
            {tags.map((tag) => (
              <FtlTag key={tag} variant="ghost">{tag}</FtlTag>
            ))}
          </div>
          <FtlRule />
          <div className={styles.actions}>
            <FtlLinkButton href={routes.home} variant="primary" trailingArrow>Back home</FtlLinkButton>
            <FtlLinkButton href={routes.styleguide} variant="ghost">View styleguide</FtlLinkButton>
          </div>
        </FtlContainer>
      </main>
    </>
  );
}
