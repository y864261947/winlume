import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getAuthMode } from "@/lib/platform/auth";
import { getPlatformRepositories } from "@/lib/platform/repositories";

export interface CurrentAuthContext {
  userId: string;
  username: string;
  displayName: string;
  email: string | null;
  platformRole: "user" | "admin";
  authVersion: number;
  legacyNewApiUserId: number | null;
}

export async function getCurrentAuthContext(): Promise<CurrentAuthContext | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id || user.status !== "active") return null;

  if (getAuthMode() === "legacy") {
    return {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email ?? null,
      platformRole: user.platformRole,
      authVersion: user.authVersion,
      legacyNewApiUserId: user.legacyNewApiUserId,
    };
  }

  const repositories = getPlatformRepositories();
  if (!repositories) return null;
  const current = await repositories.users.findById(user.id);
  if (!current || current.status !== "active" || current.authVersion !== user.authVersion) return null;
  return {
    userId: current.id,
    username: current.username,
    displayName: current.displayName,
    email: current.email ?? null,
    platformRole: current.platformRole,
    authVersion: current.authVersion,
    legacyNewApiUserId: current.legacyNewApiUserId ?? null,
  };
}

export async function getCurrentUserId(): Promise<string | null> {
  return (await getCurrentAuthContext())?.userId ?? null;
}

export async function getCurrentUser() {
  return getServerSession(authOptions);
}
