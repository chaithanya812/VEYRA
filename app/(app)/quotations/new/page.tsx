import { listLeads } from "@/lib/data/leads";
import { listProjects } from "@/lib/data/projects";
import { NewQuotationForm, type PickerOption } from "./new-quotation-form";

/**
 * New quotation. Leads and projects are loaded here so the Source picker can
 * link the quote to a real record rather than leaving it orphaned.
 */
export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>;
}) {
  const { lead } = await searchParams;
  const [leads, projects] = await Promise.all([listLeads(), listProjects()]);

  const leadOptions: PickerOption[] = leads.map((l) => ({
    id: l.id,
    label: l.name,
    sub: l.phone,
    value: l.value,
  }));
  const projectOptions: PickerOption[] = projects.map((p) => ({
    id: p.id,
    label: p.name,
    sub: p.client_name ?? null,
    value: p.project_value ?? null,
  }));

  return (
    <NewQuotationForm
      leads={leadOptions}
      projects={projectOptions}
      defaultLeadId={lead}
    />
  );
}
