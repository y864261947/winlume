import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/session";
import GatewayAdminShell from "@/components/gateway-admin/GatewayAdminShell";

export default async function GatewayAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await getCurrentAuthContext();
  if (!context || context.platformRole !== "admin") {
    redirect("/");
  }
  return <GatewayAdminShell adminName={context.displayName ?? context.username}>{children}</GatewayAdminShell>;
}
