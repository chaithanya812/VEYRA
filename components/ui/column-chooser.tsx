import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  COLUMNS_PARAM,
  columnChoices,
  describeColumns,
  type SavedViewScreen,
} from "@/lib/saved-views-model";

/**
 * The column chooser — built ONCE, over any screen registered in
 * `lib/saved-views-model.ts`.
 *
 * ⚠ THERE IS NO CLIENT STATE HERE, DELIBERATELY. It is a native `<details>`
 * holding a plain GET form: ticking columns and pressing Apply navigates, and
 * the server re-renders the table the URL asks for. That removes the entire
 * class of defect where a control's state and the rendered table disagree —
 * there is nothing to spring back to, because nothing is held in React.
 *
 * The current filter is carried through as hidden inputs, so choosing columns
 * never silently widens the rows you are looking at. `cols` is deliberately
 * NOT among them: the checkboxes are the new value of that param.
 */
export function ColumnChooser({
  screen,
  visible,
  filterEntries,
}: {
  screen: SavedViewScreen;
  visible: string[];
  /** The screen's own filter params, exactly as it resolved them. */
  filterEntries: readonly (readonly [string, string])[];
}) {
  if (!screen.columns.length) return null;
  const choices = columnChoices(screen, visible);

  return (
    <details className="relative" data-testid="column-chooser">
      <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-md border border-[var(--color-border-strong)] px-3 text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]">
        <Columns3 className="size-4" />
        Columns
        <span className="text-[var(--color-ink-secondary)]">
          {describeColumns(screen, visible)}
        </span>
      </summary>

      <form
        method="get"
        className="absolute right-0 z-40 mt-2 w-72 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg"
      >
        {/* The filter travels with the choice. Without these the Apply button
            would quietly reset the table to every row. */}
        {filterEntries.map(([k, v], i) => (
          <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
        ))}

        <fieldset className="max-h-72 overflow-auto">
          <legend className="sr-only">Columns to show</legend>
          {choices.map((c) => (
            <label
              key={c.key}
              title={c.note}
              className="flex items-start gap-2 rounded px-1 py-1.5 text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
            >
              <input
                type="checkbox"
                name={COLUMNS_PARAM}
                value={c.key}
                defaultChecked={c.checked}
                className="mt-0.5 size-4 accent-[var(--color-ink)]"
              />
              {c.label}
            </label>
          ))}
        </fieldset>

        <p className="mt-2 text-[12px] text-[var(--color-ink-secondary)]">
          Untick everything and the full set comes back — a table of no columns
          is a broken screen, not a filtered one.
        </p>

        <div className="mt-2 flex justify-end">
          <Button type="submit" variant="secondary">
            Apply columns
          </Button>
        </div>
      </form>
    </details>
  );
}
