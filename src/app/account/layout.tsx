import type { Metadata } from "next";
import AccountShell from "@/components/account/AccountShell";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: `${site.name} 账户与个人中心`,
  description: "管理你的 WinLume 账户、钱包、工作区与常用能力。",
};

export default function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AccountShell>{children}</AccountShell>;
}
