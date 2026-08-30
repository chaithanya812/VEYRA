/**
 * End-to-end verification of DOCUMENT STORAGE against the real Supabase bucket.
 *
 * `verify.mjs` proves the rows are isolated; this proves the BYTES are. The
 * owner's rule — *"project 1 and project 2 can't share the same folders"* — is
 * enforced three times over (FK, unique index, storage path), and the third one
 * is the only one a database test cannot see.
 *
 * What it asserts:
 *   1. the bucket exists and is PRIVATE (no public read)
 *   2. an object lands under <org_id>/<project_id>/<file_id>/v<n>-<name>
 *   3. listing project 1's prefix never returns project 2's object
 *   4. a signed URL fetches; an unsigned one does not
 *   5. a second version never overwrites the first
 *
 * Run: node scripts/verify-storage.mjs
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, "..", ".env.local") });

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
);

const BUCKET = "project-files";
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};

const org = randomUUID();
const projectA = randomUUID();
const projectB = randomUUID();
const fileA = randomUUID();
const written = [];

const pathFor = (project, file, version, name) =>
  `${org}/${project}/${file}/v${version}-${name}`;

async function main() {
  // 1. The bucket, created the way the app creates it.
  const existing = await sb.storage.getBucket(BUCKET);
  if (!existing.data) {
    const { error } = await sb.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 25 * 1024 * 1024,
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  const bucket = await sb.storage.getBucket(BUCKET);
  check("the project-files bucket exists", !!bucket.data, bucket.error?.message ?? "");
  check(
    "the bucket is PRIVATE — nothing is served from a public URL",
    bucket.data?.public === false,
    `public=${bucket.data?.public}`,
  );

  // 2. An object lands under org/project/file/version.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const p1 = pathFor(projectA, fileA, 1, "plan.png");
  const up1 = await sb.storage.from(BUCKET).upload(p1, png, {
    contentType: "image/png",
    upsert: false,
  });
  written.push(p1);
  check("an object uploads to its project's prefix", !up1.error, up1.error?.message ?? p1);

  // 3. Project B's object is not reachable from project A's prefix.
  const p2 = pathFor(projectB, randomUUID(), 1, "other.png");
  await sb.storage.from(BUCKET).upload(p2, png, { contentType: "image/png" });
  written.push(p2);

  const listA = await sb.storage.from(BUCKET).list(`${org}/${projectA}`, { limit: 100 });
  const listB = await sb.storage.from(BUCKET).list(`${org}/${projectB}`, { limit: 100 });
  const aNames = (listA.data ?? []).map((o) => o.name);
  const bNames = (listB.data ?? []).map((o) => o.name);
  check(
    "one project's prefix never lists another project's objects",
    aNames.length === 1 && bNames.length === 1 && aNames[0] !== bNames[0],
    `A=[${aNames}] B=[${bNames}]`,
  );

  // 4. Signed vs unsigned access.
  const signed = await sb.storage.from(BUCKET).createSignedUrl(p1, 60);
  const signedRes = signed.data?.signedUrl
    ? await fetch(signed.data.signedUrl)
    : { status: 0 };
  check("a signed URL fetches the object", signedRes.status === 200, `status ${signedRes.status}`);

  const publicUrl = sb.storage.from(BUCKET).getPublicUrl(p1).data.publicUrl;
  const publicRes = await fetch(publicUrl);
  check(
    "the same object is NOT readable without a signature",
    publicRes.status >= 400,
    `status ${publicRes.status}`,
  );

  // 5. A version never overwrites its predecessor.
  const v2 = pathFor(projectA, fileA, 2, "plan.png");
  const up2 = await sb.storage.from(BUCKET).upload(v2, png, { contentType: "image/png" });
  written.push(v2);
  const bothVersions = await sb.storage.from(BUCKET).list(`${org}/${projectA}/${fileA}`);
  check(
    "uploading v2 leaves v1 in place",
    !up2.error && (bothVersions.data ?? []).length === 2,
    `${(bothVersions.data ?? []).length} objects`,
  );

  const clash = await sb.storage.from(BUCKET).upload(p1, png, { upsert: false });
  check(
    "re-uploading the same key is refused rather than silently overwriting",
    !!clash.error,
    clash.error?.message ?? "no error",
  );
}

main()
  .catch((e) => {
    console.error("✗ verify-storage threw:", e.message);
    fail++;
  })
  .finally(async () => {
    if (written.length) await sb.storage.from(BUCKET).remove(written);
    console.log(`\n${pass} passed, ${fail} failed. Test objects removed.`);
    process.exit(fail ? 1 : 0);
  });
