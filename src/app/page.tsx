import ModelMarket from "@/components/ModelMarket";

// Homepage content is managed at runtime; do not let a reverse proxy keep an
// old shell around after an administrator publishes new images.
export const dynamic = "force-dynamic";

export default function Home() {
  return <ModelMarket />;
}
