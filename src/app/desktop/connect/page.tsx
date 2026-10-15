import DesktopConnect from "./DesktopConnect";

export const metadata = { title: "登录 Reizo Studio", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Page({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const params = await searchParams;
  return <DesktopConnect requestId={typeof params.request === "string" ? params.request : ""} />;
}
