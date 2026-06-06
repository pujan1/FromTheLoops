import { routes } from "@/lib/routes";
import styles from "./search-bar.module.css";

// Global search entry point. A plain GET <form> to /search — no client JS, so
// it works with scripting off and every search is a real, shareable URL
// (?q=…). Reused in the header (compact) and atop the /search page (large,
// pre-filled with the active query). Server component.

export function SearchBar({
  defaultValue = "",
  size = "compact",
  autoFocus = false,
}: {
  defaultValue?: string;
  size?: "compact" | "large";
  autoFocus?: boolean;
}) {
  return (
    <form
      className={`${styles.form} ${size === "large" ? styles["form--large"] : ""}`}
      action={routes.search}
      method="get"
      role="search"
    >
      <span className={styles.icon} aria-hidden="true">
        ⌕
      </span>
      <input
        type="search"
        name="q"
        className={styles.input}
        placeholder="Search companies, roles, topics…"
        defaultValue={defaultValue}
        aria-label="Search interview reports"
        autoFocus={autoFocus}
        autoComplete="off"
      />
      <button type="submit" className={styles.submit}>
        Search
      </button>
    </form>
  );
}
