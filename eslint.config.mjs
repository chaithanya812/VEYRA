import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "competitor-research/**",
      "scripts/**",
      "next-env.d.ts",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Keep lint useful, not noisy: real bugs error, style nits warn.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",

      // ⛔ Tenant-isolation guard: the raw secret-key Supabase client may only be
      // imported inside lib/data and lib/supabase. Everywhere else must use the
      // org-scoped accessor (lib/data/with-org.ts). RLS is OFF — this rule is the
      // codified "no raw table access". Do not weaken it.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/admin",
              message:
                "Do not import the admin (secret-key) client directly. Use withOrg() from @/lib/data/with-org so org_id isolation is enforced. RLS is OFF — there is no DB backstop.",
            },
          ],
        },
      ],
    },
  },
  {
    // The data layer itself is allowed to import the admin client.
    files: ["lib/data/**", "lib/supabase/**"],
    rules: { "no-restricted-imports": "off" },
  },
);
