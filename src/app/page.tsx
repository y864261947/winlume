import ModelMarket from "@/components/ModelMarket";
import { getPortalContent } from "@/lib/portal/content-config";

// Homepage content is managed at runtime; do not let a reverse proxy keep an
// old shell around after an administrator publishes new images.
export const dynamic = "force-dynamic";

export default async function Home() {
  const initialContent = await getPortalContent();
  return <ModelMarket initialContent={initialContent} />;
}
