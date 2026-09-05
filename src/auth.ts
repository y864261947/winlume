import type { NextAuthOptions, User } from "next-auth";
import type { AdapterUser } from "next-auth/adapters";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import type { OAuthConfig } from "next-auth/providers/oauth";
import {
  applySessionClaimsToToken,
  authenticatePlatformCredentials,
  getAuthMode,
  sessionClaimsFromToken,
  type PlatformAuthUser,
} from "@/lib/platform/auth";
import {
  authenticateSocialOAuth,
  getGitHubOAuthCredentials,
  getGoogleOAuthCredentials,
  isGitHubOAuthConfigured,
  isGoogleOAuthConfigured,
  type SocialAuthProvider,
} from "@/lib/platform/social-oauth";

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

function isPlatformAuthUser(user: User | AdapterUser): user is (User | AdapterUser) & PlatformAuthUser {
  return typeof user.username === "string"
    && typeof user.displayName === "string"
    && typeof user.platformRole === "string"
    && typeof user.status === "string"
    && typeof user.authVersion === "number";
}

function createReizoCredentialsProvider() {
  return CredentialsProvider({
    id: "credentials",
    name: "Reizo",
    credentials: {
      username: { label: "用户名", type: "text" },
      password: { label: "密码", type: "password" },
    },
    async authorize(credentials) {
      try {
        return await authenticatePlatformCredentials({
          username: credentials?.username ?? "",
          password: credentials?.password ?? "",
        });
      } catch {
        return null;
      }
    },
  });
}

function createGoogleProvider() {
  const credentials = getGoogleOAuthCredentials();
  if (!credentials) return null;
  return GoogleProvider({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    // Account linking is handled in authenticateSocialOAuth via verified email.
    allowDangerousEmailAccountLinking: false,
  });
}

function createGitHubProvider() {
  const credentials = getGitHubOAuthCredentials();
  if (!credentials) return null;
  return GitHubProvider({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    allowDangerousEmailAccountLinking: false,
  });
}

function isSocialAuthProvider(value: string | undefined): value is SocialAuthProvider {
  return value === "google" || value === "github";
}

function socialProfileFromCallback(input: {
  provider: SocialAuthProvider;
  account: { providerAccountId?: string | null };
  user?: { email?: string | null; name?: string | null; image?: string | null } | null;
  profile?: unknown;
}) {
  const providerAccountId = input.account.providerAccountId?.trim();
  if (!providerAccountId) return null;
  const profile = input.profile && typeof input.profile === "object" ? input.profile as Record<string, unknown> : {};
  const email = (typeof profile.email === "string" ? profile.email : input.user?.email) ?? null;
  const name = (typeof profile.name === "string" ? profile.name : input.user?.name) ?? null;
  const image = (typeof input.user?.image === "string" ? input.user.image : null)
    ?? (typeof profile.avatar_url === "string" ? profile.avatar_url : null);
  const emailVerified = typeof profile.email_verified === "boolean"
    ? profile.email_verified
    : true;
  const usernameHint = input.provider === "github" && typeof profile.login === "string"
    ? profile.login
    : null;
  return {
    provider: input.provider,
    providerAccountId,
    email,
    name,
    image,
    emailVerified,
    usernameHint,
  };
}

function legacyGatewayUrl(): string | undefined {
  const configured = process.env.NEW_API_URL?.trim();
  return configured ? configured.replace(/\/+$/, "") : undefined;
}

function gatewayUser(payload: GatewayLoginPayload) {
  const user = payload.data;
  if (!payload.success || !user?.id || !user.username) return null;
  return {
    id: String(user.id),
    name: user.display_name || user.username,
    email: user.email ?? null,
  };
}

function createLegacyProviders(): NextAuthOptions["providers"] {
  const gatewayUrl = legacyGatewayUrl();
  const providers: NextAuthOptions["providers"] = [
    CredentialsProvider({
      id: "credentials",
      name: "用户名和密码",
      credentials: {
        username: { label: "用户名", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        if (!gatewayUrl) return null;
        const username = credentials?.username?.trim();
        const password = credentials?.password;
        if (!username || !password) return null;
        try {
          const response = await fetch(`${gatewayUrl}/api/user/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username, password }),
            cache: "no-store",
          });
          if (!response.ok) return null;
          const payload = (await response.json().catch(() => null)) as GatewayLoginPayload | null;
          return payload ? gatewayUser(payload) : null;
        } catch {
          return null;
        }
      },
    }),
  ];

  if (gatewayUrl && process.env.AUTH_V2API_ID && process.env.AUTH_V2API_SECRET) {
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
    providers.unshift(v2ApiProvider);
  }
  return providers;
}

function createReizoProviders(): NextAuthOptions["providers"] {
  const providers: NextAuthOptions["providers"] = [createReizoCredentialsProvider()];
  const github = createGitHubProvider();
  if (github) providers.unshift(github);
  const google = createGoogleProvider();
  if (google) providers.unshift(google);
  return providers;
}

export function createAuthOptions(mode = getAuthMode()): NextAuthOptions {
  const providers = mode === "legacy" ? createLegacyProviders() : createReizoProviders();
  return {
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    // Credentials authentication uses Auth.js JWTs even when the identity is
    // looked up in PostgreSQL. Keep this explicit: Auth.js database sessions
    // are not a supported replacement for the credentials provider.
    session: { strategy: "jwt" },
    providers,
    pages: {
      // Keep failures in-app; LoginModal remains the primary surface.
      error: "/",
      signIn: "/",
    },
    callbacks: {
      async signIn({ user, account, profile }) {
        if (!account || account.provider === "credentials" || account.provider === "v2api") {
          return true;
        }
        if (!isSocialAuthProvider(account.provider) || mode === "legacy") return false;
        if (account.provider === "google" && !isGoogleOAuthConfigured()) return false;
        if (account.provider === "github" && !isGitHubOAuthConfigured()) return false;

        const social = socialProfileFromCallback({
          provider: account.provider,
          account,
          user,
          profile,
        });
        if (!social) return false;

        try {
          const platformUser = await authenticateSocialOAuth(social);
          return platformUser !== null;
        } catch (error) {
          console.error(`${account.provider} OAuth sign-in failed`, error);
          return false;
        }
      },
      async jwt({ token, user, account, profile }) {
        if (account && isSocialAuthProvider(account.provider)) {
          const social = socialProfileFromCallback({
            provider: account.provider,
            account,
            user,
            profile,
          });
          if (!social) return token;
          try {
            const platformUser = await authenticateSocialOAuth(social);
            if (!platformUser) return token;
            return applySessionClaimsToToken(token, platformUser) as typeof token;
          } catch (error) {
            console.error(`${account.provider} OAuth JWT mapping failed`, error);
            return token;
          }
        }

        if (!user) return token;
        token.sub = user.id;
        if (!isPlatformAuthUser(user)) return token;
        return applySessionClaimsToToken(token, user) as typeof token;
      },
      async session({ session, token }) {
        const claims = sessionClaimsFromToken(token);
        if (!session.user || !claims) return session;
        session.user.id = claims.id;
        session.user.name = claims.displayName;
        session.user.email = claims.email;
        session.user.username = claims.username;
        session.user.displayName = claims.displayName;
        session.user.platformRole = claims.platformRole;
        session.user.status = claims.status;
        session.user.authVersion = claims.authVersion;
        session.user.legacyNewApiUserId = claims.legacyNewApiUserId;
        return session;
      },
    },
  };
}

export const authOptions: NextAuthOptions = createAuthOptions();
