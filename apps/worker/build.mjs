// Bundles the worker into a single self-contained dist/index.js.
//
// Why a bundler instead of plain `tsc`: the @fromtheloop/* workspace packages
// declare their entry as raw `./src/index.ts` (great for Next's transpilePackages
// and tsx, but plain `node` can't load a `.ts` file). tsc leaves the bare
// `@fromtheloop/db` imports for the runtime to resolve, and `pnpm deploy --prod`
// copies those packages into node_modules still pointing at .ts — so the worker
// crash-loops with ERR_UNKNOWN_FILE_EXTENSION. Bundling compiles + inlines the
// workspace source while keeping every real third-party dep external (required
// from node_modules), so bullmq's Lua scripts, pg, etc. are untouched.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist/index.js",
  sourcemap: true,
  logLevel: "info",
  // ESM output that imports CommonJS externals needs a require() shim in scope.
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
  plugins: [
    {
      // Inline @fromtheloop/* (workspace source); externalize everything else
      // (real npm deps + node: builtins) so they resolve from node_modules.
      name: "externalize-third-party",
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith("@fromtheloop/")) return undefined;
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
