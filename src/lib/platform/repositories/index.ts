import { getPlatformDb, type PlatformDatabase } from "../db/client";
import { ApiKeyRepository } from "./api-keys";
import { AuthIdentityRepository } from "./auth-identities";
import { BillingRepository } from "./billing";
import { OrganizationRepository } from "./organizations";
import { PresetRepository } from "./presets";
import { TeamNewApiMappingRepository } from "./team-new-api-mapping";
import { UserRepository } from "./users";
import { WalletRepository } from "./wallet";

export class PlatformRepositories {
  readonly users: UserRepository;
  readonly identities: AuthIdentityRepository;
  readonly organizations: OrganizationRepository;
  readonly apiKeys: ApiKeyRepository;
  readonly billing: BillingRepository;
  readonly wallets: WalletRepository;
  readonly presets: PresetRepository;
  readonly teamNewApiMapping: TeamNewApiMappingRepository;

  constructor(database: PlatformDatabase) {
    this.users = new UserRepository(database);
    this.identities = new AuthIdentityRepository(database);
    this.organizations = new OrganizationRepository(database);
    this.apiKeys = new ApiKeyRepository(database);
    this.billing = new BillingRepository(database);
    this.wallets = new WalletRepository(database);
    this.presets = new PresetRepository(database);
    this.teamNewApiMapping = new TeamNewApiMappingRepository(database);
  }
}

export function getPlatformRepositories(): PlatformRepositories | null {
  const database = getPlatformDb();
  return database ? new PlatformRepositories(database) : null;
}

export * from "./api-keys";
export * from "./auth-identities";
export * from "./billing";
export * from "./organizations";
export * from "./presets";
export * from "./team-new-api-mapping";
export * from "./users";
export * from "./wallet";
