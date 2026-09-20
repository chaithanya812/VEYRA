import {
  PROCUREMENT_EXPLAINERS,
  type ExplainerKey,
} from "@/lib/procurement-explainers";
import { cn } from "@/lib/utils";

/**
 * Renders one authored explainer. Strings live only in the map — this
 * component never invents copy. Grey hint text, never red.
 */
export function Explainer({
  k,
  className,
}: {
  k: ExplainerKey;
  className?: string;
}) {
  const entry = PROCUREMENT_EXPLAINERS[k];
  return (
    <p className={cn("text-xs text-[var(--color-ink-secondary)]", className)}>
      <span className="font-medium text-[var(--color-ink)]">{entry.term}</span>
      {" — "}
      {entry.body}
    </p>
  );
}
