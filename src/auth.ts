import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { OAuthConfig } from "next-auth/providers/oauth";

type GatewayLoginPayload = {
  success?: boolean;
  data?: {
    id?: number;
    username?: string;
    display_name?: string;
    email?: string;
    group?: string;
  };
};

type V2ApiProfile = {
  sub?: string;
  preferred_username?: string;
  name?: string;
  email?: string;
};

const gatewayUrl = (process.env.NEW_API_URL ?? "https://v2api.top").replace(/\/+$/, "");

function gatewayUser(payload: GatewayLoginPayload) {
  const user = payload.data;
  if (!payload.success || !user?.id || !user.username) return null;
  return {
    id: String(user.id),
    name: user.display_name || user.username,
    email: user.email ?? null,
  };
}

const v2ApiProvider: OAuthConfig<V2ApiProfile> = {
  id: "v2api",
  name: "v2api",
  type: "oauth",
  clientId: process.env.AUTH_V2API_ID,
  clientSecret: process.env.AUTH_V2API_SECRET,
  authorization: {
    url: `${gatewayUrl}/oauth/authorize`,
    params: { scope: "profile email" },
  },
  token: `${gatewayUrl}/api/oauth/token`,
  userinfo: `${gatewayUrl}/api/oauth/userinfo`,
  checks: ["pkce", "state"],
  profile(profile) {
    const id = profile.sub?.trim();
    if (!id) throw new Error("v2api userinfo response did not include sub");
    const username = profile.preferred_username?.trim() || id;
    return {
      id,
      name: profile.name?.trim() || username,
      email: profile.email?.trim() || null,
    };
  },
};

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    id: "credentials",
    name: "用户名和密码",
    credentials: {
      username: { label: "用户名", type: "text" },
      password: { label: "密码", type: "password" },
    },
    async authorize(credentials) {
      const username = credentials?.username?.trim();
      const password = credentials?.password;
      if (!username || !password) return null;

      const response = await fetch(`${gatewayUrl}/api/user/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
        cache: "no-store",
      });
      if (!response.ok) return null;

      const payload = (await response.json().catch(() => null)) as GatewayLoginPayload | null;
      return payload ? gatewayUser(payload) : null;
    },
  }),
];

if (process.env.AUTH_V2API_ID && process.env.AUTH_V2API_SECRET) {
  providers.unshift(v2ApiProvider);
}

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  providers,
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
};
