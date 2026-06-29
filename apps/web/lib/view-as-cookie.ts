// The "view as user" cookie name, isolated in a dependency-free module so the
// edge middleware can import it without pulling in next/headers or the db package
// (which lib/view-as.ts depends on and which don't run in the edge runtime).
export const VIEW_AS_COOKIE = "ftl_view_as";
