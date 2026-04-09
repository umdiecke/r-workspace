# Release Notes

## 1.4.0

Release date: 2026-04-09

Relevant changes:

- Added a dedicated profile area for authenticated users to review and update personal data.
- Added account deletion with a two-step confirmation dialog in the UI.
- Added backend endpoints for profile updates and account deletion.
- Fixed mobile login flows for local network access by allowing common local development origins through CORS.
- Improved the login flow so the app loads the authenticated user immediately after token retrieval.
- Expanded the PWA setup with install guidance, richer manifest metadata, and a better offline cache bootstrap.
- Added an in-app install action for supported browsers.

## 1.3.1

Release date: 2026-04-09

Relevant changes:

- Fixed the seeded admin account email address so it passes backend email validation.
- Added an automatic migration in application startup to repair older `admin@rworkspace.local` records in existing databases.
- Updated the default SMTP sender address to a valid domain-based email.

## 1.3.0

Release date: 2026-04-09

Relevant changes:

- Added user registration with required email address storage.
- Added password reset by email with SMTP-based delivery support.
- Added account settings for updating email address and password.
- Added editing and deleting for recorded time entries.
- Kept time entries isolated per authenticated user.
- Swapped the tab order so `Zeiterfassung` comes before `Sandbox`.
- Switched German UI strings and tooltips to proper umlauts.
- Standardized visible date display in the UI to `dd.MM.yyyy`.
- Added MailHog to Docker Compose for local email testing.
- Made the frontend API target host-aware so the app also works from phones in the same network.

## 1.2.0

Release date: 2026-04-09

Relevant changes:

- Renamed the product from `UmdieckeFirst` to `R.Workspace`.
- Updated project metadata and SBOM version references to `1.2.0`.
- Added multilingual UI support for German and English with a language dropdown.
- Added translated labels and tooltips for relevant buttons and input fields.
- Improved accessibility with keyboard-friendly navigation, visible focus styles, skip links, screen-reader helper text, and a reduced accessible color palette.
- Improved responsive behavior for phones and tablets.
- Added installable web app basics with a web manifest, icons, and service worker registration.

## 1.1.0

Release date: 2026-04-09

Relevant changes:

- Added WSL development support with a dedicated startup script for hot reload.
- Added Docker Compose support for local full-stack startup.
- Added an SPDX SBOM file for software component documentation.
- Added a protected login page in the frontend.
- Added post-login navigation with `Sandbox` and `Zeiterfassung`.
- Added PostgreSQL-backed time tracking with OpenAPI endpoints.
- Added start and stop time capture with project name and activity description.
- Added persistence for previously used project names.
- Added tabular time entry display including duration in hours.
- Added filtering by project, day, month, and year.
- Added paging with configurable page sizes.
- Added CSV export for filtered time tracking results.

## 1.0.0

Release date: 2026-04-09

Relevant changes:

- Initial release of the microservice foundation.
- Added FastAPI backend with OAuth2 bearer authentication.
- Added public heartbeat endpoint returning HTTP 200, service name, and SemVer version.
- Added OpenAPI documentation and Swagger UI.
- Added React and Vite frontend scaffold.
- Added basic protected user endpoint for authenticated API testing.
