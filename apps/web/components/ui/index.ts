// Public API of the FromTheLoop UI library. Components are exported with an
// `Ftl` prefix so library primitives are unmistakable at call sites; the type
// exports keep their plain names.

export { FtlContainer } from "./container";
export {
  FtlBody,
  FtlCaption,
  FtlDisplay,
  FtlEyebrow,
  FtlHeading,
  FtlMono,
} from "./typography";
export { FtlOrnament, FtlRule } from "./rule";
export { FtlTag } from "./tag";
export { FtlButton, FtlLinkButton } from "./button";
export { FtlCard } from "./card";
export { FtlStat, FtlStatGroup } from "./stat";
export { FtlSiteHeader } from "./site-header";
export { FtlSearchBar } from "./search-bar";
export { FtlThemeToggle } from "./theme-toggle";
export { FtlReportCard, type ReportCardProps } from "./report-card";
export {
  FtlCombobox,
  type ComboboxOption,
  type ComboboxProps,
} from "./combobox";
export { FtlHoneypot } from "./honeypot";
export { FtlNotice, type NoticeTone } from "./notice";
export {
  FtlStatusBadge,
  type BadgeStatus,
} from "./status-badge";
export {
  FtlChoiceChips,
  FtlField,
  FtlInput,
  FtlSelect,
  FtlTextarea,
} from "./field";
