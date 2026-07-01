// `runtime` must be a direct literal — Next statically reads it and can't follow
// a re-export, so it's declared here rather than re-exported from opengraph-image.
export const runtime = "nodejs";
export { default, alt, size, contentType } from "./opengraph-image";
