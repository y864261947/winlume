export {
  authenticateGitHubOAuth,
  authenticateGoogleOAuth,
  authenticateSocialOAuth,
  getGitHubOAuthCredentials,
  getGoogleOAuthCredentials,
  isGitHubOAuthConfigured,
  isGoogleOAuthConfigured,
  usernameStemFromEmail,
  usernameStemFromGithubLogin,
  usernameStemFromGoogleEmail,
  type SocialAuthProvider,
  type SocialOAuthProfileInput,
  type SocialOAuthRepositories,
} from "./social-oauth";

/** @deprecated Use SocialOAuthRepositories. */
export type { SocialOAuthRepositories as GoogleOAuthRepositories } from "./social-oauth";
/** @deprecated Use SocialOAuthProfileInput. */
export type { SocialOAuthProfileInput as GoogleOAuthProfileInput } from "./social-oauth";
