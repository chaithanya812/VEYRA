import { listPaymentPlans, listPoTerms, getPoTemplate } from "@/lib/data/po-config";
import { ProcurementSettingsView } from "./procurement-settings-view";

export default async function ProcurementSettingsPage() {
  const [plans, terms, template] = await Promise.all([
    listPaymentPlans(),
    listPoTerms(),
    getPoTemplate(),
  ]);

  return <ProcurementSettingsView plans={plans} terms={terms} template={template} />;
}
