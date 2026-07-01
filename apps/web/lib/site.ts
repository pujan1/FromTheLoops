export const siteOrigin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export function absoluteUrl(path: string): string {
  return new URL(path, siteOrigin).toString();
}
