import { listPaymentPlans, listPoTerms } from "@/lib/data/po-config";
import { ProcurementSettingsView } from "./procurement-settings-view";

export default async function ProcurementSettingsPage() {
  const [plans, terms] = await Promise.all([listPaymentPlans(), listPoTerms()]);

  return <ProcurementSettingsView plans={plans} terms={terms} />;
}
