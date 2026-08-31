import { redirect } from "next/navigation";
import { getSession } from "@/lib/getSession";
import { TownScene } from "./TownScene";

export default async function TownPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return <TownScene />;
}
