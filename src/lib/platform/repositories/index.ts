import { getPlatformDb, type PlatformDatabase } from "../db/client";
import { ApiKeyRepository } from "./api-keys";
import { AuthIdentityRepository } from "./auth-identities";
import { OrganizationRepository } from "./organizations";
import { PresetRepository } from "./presets";
import { FeedbackRepository } from "./feedback";
import { PortalContentRepository } from "./portal-content";
import { SkillRepository } from "./skills";
import { TeamNewApiMappingRepository } from "./team-new-api-mapping";
import { UserRepository } from "./users";

export class PlatformRepositories {
  readonly users: UserRepository;
  readonly identities: AuthIdentityRepository;
  readonly organizations: OrganizationRepository;
  readonly apiKeys: ApiKeyRepository;
  readonly presets: PresetRepository;
  readonly portalContent: PortalContentRepository;
  readonly skills: SkillRepository;
  readonly teamNewApiMapping: TeamNewApiMappingRepository;
  readonly feedback: FeedbackRepository;

  constructor(database: PlatformDatabase) {
    this.users = new UserRepository(database);
    this.identities = new AuthIdentityRepository(database);
    this.organizations = new OrganizationRepository(database);
    this.apiKeys = new ApiKeyRepository(database);
    this.presets = new PresetRepository(database);
    this.portalContent = new PortalContentRepository(database);
    this.skills = new SkillRepository(database);
    this.teamNewApiMapping = new TeamNewApiMappingRepository(database);
    this.feedback = new FeedbackRepository(database);
  }
}

export function getPlatformRepositories(): PlatformRepositories | null {
  const database = getPlatformDb();
  return database ? new PlatformRepositories(database) : null;
}

export * from "./api-keys";
export * from "./auth-identities";
export * from "./organizations";
export * from "./presets";
export * from "./feedback";
export * from "./portal-content";
export * from "./skills";
export * from "./team-new-api-mapping";
export * from "./users";
