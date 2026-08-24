import { redirect } from "next/navigation";
import { studioDrawHref } from "@/lib/studio/studio-mode";

export default function StudioDrawIndexPage() {
  redirect(studioDrawHref());
}
