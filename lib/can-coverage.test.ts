import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { isCapability } from "./can-model";

/**
 * Unit 6's real deliverable is the REFUSAL, not the call. Two things can go
 * wrong quietly once ~160 guards exist, and neither shows up in a screenshot:
 *
 *  1. A new server action ships with no guard at all. It works perfectly for
 *     the author, who is the owner, and is wide open for everybody else.
 *  2. A guard names a capability the registry does not know. `can()` fails
 *     closed on it, so the action refuses EVERYONE including the owner —
 *     a lockout that only shows up when somebody tries the feature.
 *
 * This test walks the real files, so it keeps working for actions nobody has
 * written yet. It is the reason a guard cannot silently go missing.
 */

const ACTIONS_ROOT = "app";

/**
 * Actions that operate ONLY on the caller's own record. Gating these would not
 * be security — a member who cannot clock in, apply for their own leave or file
 * their own expense simply cannot use the product. Every entry here is a
 * decision, not an omission, which is why the list is explicit and asserted.
 */
const SELF_SERVICE = new Set([
  "checkInAction",
  "checkOutAction",
  "requestLeaveAction",
  "cancelLeaveAction",
  "applyLeaveAction",
  "submitExpenseAction",
  // Petty Finance (`110521`). `member_id` is taken from the acting context and
  // never from the form, so the only row it can write is the caller's own —
  // the same argument as `submitExpenseAction`, which it sits beside.
  "recordPettyEntryAction",
  "startVisitAction",
  "endVisitAction",
  "setActingMemberAction",
  // ── PRE-SESSION ──────────────────────────────────────────────────────────
  // These are ungated for a different reason than the rows above. The entries
  // above write a row keyed to the ACTING member, so gating them would lock a
  // person out of their own records. These have no actor to check at all: they
  // run before anyone is chosen, so there is no capability to test and any
  // guard would be a guard against nobody.
  //
  // ⛔ `startSessionAction` takes its member id FROM THE FORM, so it is NOT
  // self-service by the usual test and must not be read as one. It is the demo
  // front door, and it is deliberately open — anyone with the URL can start a
  // session as the Owner. It validates only that the id belongs to THIS org,
  // which keeps it from reaching another tenant. See app/(auth)/login/actions.ts.
  "startSessionAction",
  "endSessionAction",
  "signUp",
  "signIn",
  "signOut",
]);

function actionFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) actionFiles(full, found);
    else if (entry === "actions.ts") found.push(full);
  }
  return found;
}

/** Split a file into its exported server actions, with each body. */
function actionsIn(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /export async function (\w+)\(/g;
  let m: RegExpExecArray | null;
  const starts: { name: string; at: number }[] = [];
  while ((m = re.exec(src))) starts.push({ name: m[1], at: m.index });
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
    out.push({ name: starts[i].name, body: src.slice(starts[i].at, end) });
  }
  return out;
}

const files = actionFiles(ACTIONS_ROOT);
const all = files.flatMap((f) =>
  // Normalised to LF. The working tree is CRLF on Windows, so a walker looking
  // for a brace followed by a newline finds nothing - which would make every
  // assertion below pass by examining an empty list. A green test that checked
  // nothing is the worst outcome available here.
  actionsIn(readFileSync(f, "utf8").split(String.fromCharCode(13)).join("")).map(
    (a) => ({ ...a, file: f }),
  ),
);

describe("every report is gated on a real capability", () => {
  const src = readFileSync(join("app", "(app)", "reports", "reports-config.tsx"), "utf8");

  it("finds the report definitions (guards the reader itself)", () => {
    expect(src.match(/slug: "/g)?.length ?? 0).toBeGreaterThanOrEqual(9);
  });

  it("every report declares a capability", () => {
    const slugs = src.match(/slug: "/g)?.length ?? 0;
    const caps = src.match(/capability: "/g)?.length ?? 0;
    // One capability per report. A report without one would be reachable by
    // anybody who could guess its URL.
    expect(caps).toBe(slugs);
  });

  it("every declared capability exists in the registry", () => {
    const bad: string[] = [];
    for (const m of src.matchAll(/capability: "([^"]+)"/g)) {
      if (!isCapability(m[1])) bad.push(m[1]);
    }
    // A typo here fails CLOSED, so the report refuses everyone — owner
    // included — and only shows up when somebody tries to open it.
    expect(bad).toEqual([]);
  });

  it("all six Reports permission groups resolve to a real report", () => {
    // Part 3 Unit 5 named six. A report a permission names and the product
    // does not have is the same broken promise as a permission nothing
    // enforces, pointing the other way.
    const declared = new Set(
      [...src.matchAll(/capability: "([^"]+)"/g)].map((m) => m[1]),
    );
    for (const key of [
      "reports.payment.view",
      "reports.client.view",
      "reports.user.view",
      "reports.labour.view",
      "reports.lead.view",
      "reports.financial.view",
    ]) {
      expect(declared.has(key), `${key} has no report`).toBe(true);
    }
  });
});

describe("every server action is behind can()", () => {
  it("finds the action files at all (guards the walker itself)", () => {
    expect(files.length).toBeGreaterThan(25);
    expect(all.length).toBeGreaterThan(140);
  });

  it("no action is unguarded unless it is explicitly self-service", () => {
    const unguarded = all
      .filter((a) => !SELF_SERVICE.has(a.name))
      .filter((a) => !/requireCan\(|await can\(/.test(a.body))
      .map((a) => `${a.file} :: ${a.name}`);
    expect(unguarded).toEqual([]);
  });

  it("every self-service action really is ungated, so the list stays honest", () => {
    // If one of these grows a guard, the list is wrong and somebody has just
    // locked a member out of their own attendance.
    const gated = all
      .filter((a) => SELF_SERVICE.has(a.name))
      .filter((a) => /requireCan\(|await can\(/.test(a.body))
      .map((a) => `${a.file} :: ${a.name}`);
    expect(gated).toEqual([]);
  });

  it("every capability named in a guard exists in the registry", () => {
    const bad: string[] = [];
    for (const a of all) {
      for (const m of a.body.matchAll(/(?:requireCan|can)\("([^"]+)"\)/g)) {
        if (!isCapability(m[1])) bad.push(`${a.file} :: ${a.name} → ${m[1]}`);
      }
    }
    // A typo here refuses EVERYONE, owner included, and only shows up when
    // somebody tries the feature.
    expect(bad).toEqual([]);
  });

  it("the guard is the FIRST statement, before any parse or read", () => {
    const late: string[] = [];
    for (const a of all) {
      if (SELF_SERVICE.has(a.name)) continue;
      const bodyAt = a.body.indexOf("{\n");
      // Anchor on the START of the guard statement. Matching the `requireCan(`
      // token instead would count its own `const denied = await ` prefix as
      // code standing before the guard.
      const guardAt = a.body.search(/const denied = await requireCan\(|if \(!\(await can\(/);
      const between = a.body.slice(bodyAt + 2, guardAt);
      // Only whitespace may precede it. Validating before checking permission
      // leaks which inputs are valid to somebody with no right to ask.
      if (between.trim() !== "") late.push(`${a.file} :: ${a.name}`);
    }
    expect(late).toEqual([]);
  });
});
