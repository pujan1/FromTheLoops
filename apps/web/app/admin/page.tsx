// /admin lands on the first moderation queue. The layout gate already asserts
// the moderator floor before this runs.

import { redirect } from "next/navigation";

export default function AdminIndexPage() {
  redirect("/admin/queues/companies");
}
