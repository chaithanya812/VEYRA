"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Crosshair } from "lucide-react";
import { checkInAction, type FormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";

/** Check-in form on the Attendance tab — the tab's one red primary. Geo
 *  coordinates auto-fill from the browser's GPS when allowed; manual entry
 *  stays possible for denied-permission fallbacks. */
export function CheckInForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    checkInAction,
    undefined,
  );
  const [geo, setGeo] = useState<{ lat: string; lng: string }>({
    lat: "",
    lng: "",
  });
  const [geoError, setGeoError] = useState<string | undefined>(undefined);

  const locate = () => {
    setGeoError(undefined);
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        });
      },
      () => setGeoError("Location permission denied — enter coordinates manually."),
    );
  };

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
        Check in
      </h2>
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Member name" htmlFor="ci_member" required>
            <Input
              id="ci_member"
              name="member_name"
              placeholder="e.g. Ramesh (carpenter lead)"
            />
          </Field>
          <Field label="Project" htmlFor="ci_project" hint="Optional label">
            <Input
              id="ci_project"
              name="project_label"
              placeholder="e.g. Malviya Nagar site"
            />
          </Field>
          <Field
            label="Latitude"
            htmlFor="ci_lat"
            error={geoError}
            hint={geoError ? undefined : "Auto or manual"}
          >
            <Input
              id="ci_lat"
              name="lat"
              inputMode="decimal"
              placeholder="e.g. 26.912436"
              value={geo.lat}
              onChange={(e) => setGeo((g) => ({ ...g, lat: e.target.value }))}
            />
          </Field>
          <Field label="Longitude" htmlFor="ci_lng">
            <Input
              id="ci_lng"
              name="lng"
              inputMode="decimal"
              placeholder="e.g. 75.787270"
              value={geo.lng}
              onChange={(e) => setGeo((g) => ({ ...g, lng: e.target.value }))}
            />
          </Field>
        </div>

        {state?.error && (
          <p className="text-sm text-[var(--color-red)]">{state.error}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={locate}>
            <Crosshair className="size-4" /> Use my location
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Checking in…" : "Check in"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
