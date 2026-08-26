import {
  aiBackendStatus,
  getQuotationSettings,
  listAiRequests,
  listPrompts,
  listTerms,
} from "@/lib/data/quotation-studio";
import { QuotationSettingsView } from "./quotation-settings-view";

export default async function QuotationSettingsPage() {
  const [settings, terms, prompts, requests] = await Promise.all([
    getQuotationSettings(),
    listTerms(),
    listPrompts(),
    listAiRequests(),
  ]);

  return (
    <QuotationSettingsView
      settings={settings}
      terms={terms}
      prompts={prompts}
      requests={requests}
      ai={aiBackendStatus()}
    />
  );
}
