import { redirect } from "next/navigation";
import { getSession } from "@/lib/getSession";
import { PlayHarness } from "./PlayHarness";

export default async function PlayPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return <PlayHarness />;
}
