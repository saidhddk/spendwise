import { redirect } from "next/navigation";
import { currentUser } from "@/lib/page";

export default async function Home() {
  redirect((await currentUser()) ? "/dashboard" : "/login");
}
