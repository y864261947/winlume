import type { DefaultSession } from "next-auth";
import type { PlatformRole, UserStatus } from "@/lib/platform/types";

declare module "next-auth" {
  interface User {
    username?: string;
    displayName?: string;
    platformRole?: PlatformRole;
    status?: UserStatus;
    authVersion?: number;
    legacyNewApiUserId?: number | null;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      username: string;
      displayName: string;
      platformRole: PlatformRole;
      status: UserStatus;
      authVersion: number;
      legacyNewApiUserId: number | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    username?: string;
    displayName?: string;
    platformRole?: PlatformRole;
    status?: UserStatus;
    authVersion?: number;
    legacyNewApiUserId?: number | null;
  }
}
