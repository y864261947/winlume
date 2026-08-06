export type ConsoleApiKey = {
  id: string;
  name: string;
  prefix: string;
  status: "active" | "disabled" | "revoked" | "expired";
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  quotaLimit: number | null;
  usedQuota: number;
  modelScopes: string[];
  ipAllowList: string[];
  organizationId: string | null;
  ownerUserId: string;
  ownerName: string | null;
};

export type ConsoleWallet = {
  availableCredits: number;
  reservedCredits: number;
  usedCredits: number;
  currency: string;
  subscription: {
    name: string;
    status: "active" | "inactive" | "none";
    renewsAt: string | null;
  };
};

export type ConsoleLedgerEntry = {
  id: string;
  type: string;
  amountCredits: number;
  reference: string | null;
  createdAt: string;
};

export type ConsolePaymentOrder = {
  id: string;
  reference: string;
  status: string;
  amount: number;
  currency: string;
  credits: number;
  provider: string;
  createdAt: string;
  paidAt: string | null;
};

export type ConsoleWalletDetails = {
  wallet: ConsoleWallet;
  ledger: ConsoleLedgerEntry[];
  paymentOrders: ConsolePaymentOrder[];
};

export type ConsoleUsagePoint = {
  date: string;
  credits: number;
  requests: number;
};

export type ConsoleOverview = {
  wallet: ConsoleWallet;
  apiKeyCount: number;
  activeOrganization: {
    id: string;
    name: string;
    role: "owner" | "admin" | "member" | "viewer";
  } | null;
  usage: ConsoleUsagePoint[];
  platformReady: boolean;
};

export type ConsoleApiErrorPayload = {
  error?: string;
  code?: string;
};

export type ConsoleOrganizationRole = "owner" | "admin" | "member" | "viewer";

export type ConsoleOrganization = {
  id: string;
  name: string;
  slug: string;
  role: ConsoleOrganizationRole;
};

export type ConsoleTeamMember = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  email: string | null;
  image: string | null;
  status: "active" | "suspended" | "pending";
  role: ConsoleOrganizationRole;
  joinedAt: string;
  isCurrentUser: boolean;
};

export type ConsoleTeam = {
  organizations: ConsoleOrganization[];
  organization: ConsoleOrganization;
  members: ConsoleTeamMember[];
  actorRole: ConsoleOrganizationRole;
  canManageMembers: boolean;
};

export type ConsolePresetCommon = {
  id: string;
  ownerUserId: string;
  organizationId: string | null;
  scope: "personal" | "organization";
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConsolePersonalityPreset = ConsolePresetCommon & {
  instructions: string;
};

export type ConsoleToolPreset = ConsolePresetCommon & {
  toolConfiguration: Record<string, unknown>;
};

export type ConsolePresetKind = "personality" | "tool";

export type ConsolePresets = {
  organizations: ConsoleOrganization[];
  activeOrganization: ConsoleOrganization | null;
  canManageOrganizationPresets: boolean;
  personalities: {
    personal: ConsolePersonalityPreset[];
    organization: ConsolePersonalityPreset[];
  };
  tools: {
    personal: ConsoleToolPreset[];
    organization: ConsoleToolPreset[];
  };
};
