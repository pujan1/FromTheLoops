import {
  Body,
  Container,
  Display,
  Eyebrow,
  LinkButton,
  Rule,
  SiteHeader,
  Tag,
} from "@/components/ui";
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
      <SiteHeader />
      <main className={styles.page}>
        <Container width="prose">
          <Eyebrow tone="accent">{eyebrow}</Eyebrow>
          <Display as="h1" size="xl" style={{ marginTop: 24 }}>
            {title}
          </Display>
          <Body size="lead" tone="muted" style={{ marginTop: 24 }}>
            {body}
          </Body>
          <div className={styles.tags}>
            {tags.map((tag) => (
              <Tag key={tag} variant="ghost">{tag}</Tag>
            ))}
          </div>
          <Rule />
          <div className={styles.actions}>
            <LinkButton href="/" variant="primary" trailingArrow>Back home</LinkButton>
            <LinkButton href="/styleguide" variant="ghost">View styleguide</LinkButton>
          </div>
        </Container>
      </main>
    </>
  );
}
