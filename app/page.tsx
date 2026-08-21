import { redirect } from "next/navigation";
import { getViewer } from "@/lib/data/context";

export default async function Home() {
  const viewer = await getViewer();
  redirect(viewer ? "/leads" : "/login");
}
