import { redirect } from "next/navigation";
import {
  STUDIO_TOOL_CATEGORY_IDS,
  studioToolCategoryHref,
} from "@/lib/studio/tool-categories";

export default function StudioToolsPage() {
  redirect(studioToolCategoryHref(STUDIO_TOOL_CATEGORY_IDS[0]));
}
