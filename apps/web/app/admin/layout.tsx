// Admin shell (Sprint 6 Day 3). Wraps every /admin/* surface with the moderation
// tab nav and gates the whole area at the moderator floor — defence-in-depth on
// top of each page's own guard. The Health + Blocklist tabs are admin-only, so we
// pass the viewer's role down to decide whether to show them.

import { getRole, requireModerator } from "@/lib/admin";
import { roleAtLeast } from "@/lib/roles";
import { AdminNav } from "./_components/admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireModerator();
  const role = await getRole();

  return (
    <>
      <AdminNav canSeeAdmin={roleAtLeast(role, "admin")} />
      {children}
    </>
  );
}
