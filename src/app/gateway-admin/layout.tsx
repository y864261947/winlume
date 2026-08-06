import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/session";

export default async function GatewayAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await getCurrentAuthContext();
  if (!context || context.platformRole !== "admin") {
    redirect("/");
  }
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-lg font-semibold text-ink-950">Gateway 管理后台</h1>
      <p className="mt-1 text-sm text-ink-600">管理内部应用的 service-account key。</p>
      <div className="mt-8">{children}</div>
    </div>
  );
}
