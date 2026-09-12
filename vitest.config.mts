import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Vitest config. The 895 pure model/unit tests need nothing here — they import
 * by relative path and never touch the server. This config exists only so an
 * OPT-IN integration test (gated behind U1_LIVE=1) can import the real data
 * layer, which resolves the `@/` alias and imports the `server-only` marker:
 *
 *   - `@/` → project root, mirroring tsconfig `paths` so `@/lib/...` resolves.
 *   - `server-only` → an empty stub. The package throws when imported outside a
 *     React Server Component bundle; under Node/vitest that would break any data
 *     layer import. The data layer is genuinely server-only in the app; the stub
 *     only lets a test call it directly.
 *
 * Neither alias affects the relative-import tests, so the default suite is
 * unchanged (verified: 895 pass with and without this file).
 */
const root = path.dirname(fileURLToPath(import.meta.url)).replace(/\\/g, "/");

export default defineConfig({
  resolve: {
    alias: [
      { find: "server-only", replacement: `${root}/test/server-only-stub.mjs` },
      { find: /^@\//, replacement: `${root}/` },
    ],
  },
});
