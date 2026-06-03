// Public API of the FromTheLoop UI library. Components are exported with an
// `Ftl` prefix so library primitives are unmistakable at call sites; the type
// exports keep their plain names.

export { Container as FtlContainer } from "./container";
export {
  Body as FtlBody,
  Caption as FtlCaption,
  Display as FtlDisplay,
  Eyebrow as FtlEyebrow,
  Heading as FtlHeading,
  Mono as FtlMono,
} from "./typography";
export { Ornament as FtlOrnament, Rule as FtlRule } from "./rule";
export { Tag as FtlTag } from "./tag";
export { Button as FtlButton, LinkButton as FtlLinkButton } from "./button";
export { Card as FtlCard } from "./card";
export { Stat as FtlStat, StatGroup as FtlStatGroup } from "./stat";
export { SiteHeader as FtlSiteHeader } from "./site-header";
export { ThemeToggle as FtlThemeToggle } from "./theme-toggle";
export { ReportCard as FtlReportCard, type ReportCardProps } from "./report-card";
export {
  Combobox as FtlCombobox,
  type ComboboxOption,
  type ComboboxProps,
} from "./combobox";
export { Honeypot as FtlHoneypot } from "./honeypot";
export { Notice as FtlNotice, type NoticeTone } from "./notice";
export {
  StatusBadge as FtlStatusBadge,
  type BadgeStatus,
} from "./status-badge";
export {
  ChoiceChips as FtlChoiceChips,
  Field as FtlField,
  Input as FtlInput,
  Select as FtlSelect,
  Textarea as FtlTextarea,
} from "./field";
