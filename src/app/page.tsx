import { redirect } from "next/navigation";
import { getSession } from "@/lib/getSession";

export default async function RootPage() {
  const session = await getSession();
  redirect(session ? "/town" : "/login");
}
