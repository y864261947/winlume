import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id?.trim();
  return userId || null;
}

export async function getCurrentUser() {
  return getServerSession(authOptions);
}
