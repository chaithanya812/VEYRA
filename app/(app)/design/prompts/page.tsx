import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { listDesignPrompts } from "@/lib/data/design-prompts";
import { can } from "@/lib/data/permissions";
import { PermissionLimited } from "@/components/ui/permission-limited";
import { PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PromptComposer } from "./prompt-composer";
import { NewPromptForm } from "./new-prompt-form";

/**
 * The design prompt library.
 *
 * VEYRA does not generate images and does not pay for a render. Designers were
 * happy to paste a good prompt into whichever tool they already use, so the
 * product is the PROMPT: a template with fill-in blanks, plus the guard clauses
 * that stop the model regenerating the client's room instead of editing it.
 *
 * NO AI IS CALLED. Assembly is a pure function (lib/prompt-library-model.ts),
 * which is why this works in production today while every other AI surface is
 * dark for want of `AI_GEMINI_API_KEY`.
 *
 * No migration either: `ai_prompt_templates` (0025) already had a `kind`
 * column, and this is a new value in it.
 */
export default async function DesignPromptsPage() {
  if (!(await can("projects.project.view"))) {
    return <PermissionLimited capability="projects.project.view" />;
  }

  const prompts = await listDesignPrompts();
  const mayEdit = await can("projects.project.edit");

  return (
    <div className="mx-auto max-w-6xl">
      <Button asChild variant="ghost" className="mb-2">
        <Link href="/design">
          <ArrowLeft className="size-4" /> Back to Design vault
        </Link>
      </Button>

      <PageHeader
        title="Prompt library"
        subtitle="Templates your team writes once and reuses. Fill the blanks, copy, paste into the tool you already use with the client's photo."
      />

      {prompts.length > 0 && (
        <PromptComposer
          prompts={prompts.map((p) => ({
            id: p.id,
            name: p.name,
            prompt: p.prompt,
            is_system: p.is_system,
          }))}
        />
      )}

      {mayEdit && <NewPromptForm />}

      <p className="mt-6 flex items-start gap-2 text-xs text-[var(--color-ink-secondary)]">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Nothing here calls an AI — VEYRA writes the prompt, you run it wherever
          you like. Bring the render back and add it to the{" "}
          <Link href="/design" className="underline">
            Design vault
          </Link>{" "}
          for pin comments and client sign-off.
        </span>
      </p>
    </div>
  );
}
