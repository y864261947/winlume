# Desktop password login

`POST /api/desktop-auth/login` accepts the website account's username or email
and password. It reuses `authenticatePlatformCredentials`, including existing
password hashes, account-status checks and successful-login bookkeeping. It does
not create a browser cookie or require a browser confirmation code.

The response contains a fresh desktop bearer and public user identity. Only the
bearer's hash is stored in the existing `desktop_sessions` table, with the same
30-day lifetime and auth-version checks as browser-approved desktop sessions.
Model bootstrap, wallet authorization and revocation use the existing endpoints.
No database migration or new environment variable is required.

The route bounds JSON bodies to 4 KiB and validates identifier/password lengths.
It limits attempts by network address and hashed, normalized identifier, rejects
foreign browser origins and returns generic credential errors. Passwords are
neither persisted nor included in response/error data. Responses are not cached.

The matching client adds an `accountPasswordLogin` IPC method behind the existing
trusted-renderer checks. It clears the password on submit and when leaving the
form, revalidates the issued grant, and requires the existing encrypted local
credential store before reporting success. This does not change macOS Keychain
requirements. Restart/rebuild the desktop main process and preload to use it.

Targeted verification covers invalid input/credentials, body bounds, both rate
limits, hashed grant persistence, service outages, browser login regression, and
the real desktop-service-to-web-handler password-login/refresh/logout flow.
The latter uses an in-memory database adapter and mocked model bootstrap; it does
not use real user passwords, mint paid generation tasks or charge a wallet.

After deployment, an invalid fixture account must receive HTTP 401 from the new
endpoint. Use the desktop login form for real credentials; do not put passwords
in command history or operational reports.
