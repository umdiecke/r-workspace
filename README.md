# R.Workspace

`R.Workspace` is an accessible multilingual workspace starter that includes:

- a FastAPI backend
- OAuth2 bearer authentication with JWT access tokens
- OpenAPI documentation exposed through Swagger UI
- a public heartbeat endpoint
- PostgreSQL-backed time tracking
- a React + Vite frontend with German and English language support

## Release Notes

Release notes are tracked in `RELEASE_NOTES.md`.

## Change policy

For future changes in this project:

- update the application version according to SemVer
- document relevant changes in the release notes
- use descriptive English commit messages

## Versioning

The application version follows SemVer and is currently `1.4.0`.

## Backend

### Features

- Public heartbeat endpoint at `GET /api/heartbeat`
- OAuth2 token endpoint at `POST /oauth/token`
- Registration endpoint at `POST /api/auth/register`
- Password reset endpoint at `POST /api/auth/password-reset`
- Protected user endpoint at `GET /api/me`
- Profile update endpoint at `PUT /api/account/profile`
- Account email update at `PUT /api/account/email`
- Account password update at `PUT /api/account/password`
- Account deletion at `DELETE /api/account`
- Time tracking endpoints under `/api/time-entries`
- Remembered project suggestions at `GET /api/projects`
- Swagger UI at `/docs`

### Run

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.

### Demo credentials

- Username: `admin`
- Password: `changeit`
- Seed email: `admin@rworkspace.example.com`

## Frontend

### Run

```powershell
cd frontend
npm install
npm run dev
```

The UI will be available at `http://localhost:5173`.

For phone testing in the same network, open the frontend with your computer's IP address, for example `http://192.168.1.20:5173`. The frontend will then target the backend on the same host at port `8000`.

## Important endpoints

- `GET /api/heartbeat`
- `POST /oauth/token`
- `POST /api/auth/register`
- `POST /api/auth/password-reset`
- `GET /api/me`
- `PUT /api/account/profile`
- `PUT /api/account/email`
- `PUT /api/account/password`
- `DELETE /api/account`
- `GET /api/time-entries/active`
- `POST /api/time-entries/start`
- `POST /api/time-entries/{entry_id}/stop`
- `PUT /api/time-entries/{entry_id}`
- `DELETE /api/time-entries/{entry_id}`
- `GET /api/time-entries`
- `GET /api/time-entries/export`
- `GET /api/projects`

## Accessibility and language support

The current UI supports:

- German and English language switching
- keyboard-friendly navigation
- screen-reader-friendly labels, captions, and live regions
- translated tooltips for buttons and input fields
- a reduced accessible color palette

## Responsive and installable app

The frontend is designed to work on desktop, tablet, and mobile screens.

It also includes installable web app basics:

- web app manifest
- service worker registration
- application icons
- standalone display mode for supported browsers
- browser-driven install prompt support

Important for Android:

- a full app-like installation generally requires HTTPS or `localhost`
- a plain local network URL such as `http://192.168.x.x:5173` is useful for testing, but browsers may not offer full PWA installation there because it is not a secure context

On a phone or desktop browser that supports installation, open the site and use the browser's install action such as `Install app`, `Add to Home Screen`, or the install icon in the address bar.

## SBOM

The repository includes a basic SPDX SBOM at `sbom.spdx.json`.

What it currently covers:

- the application and its version
- the backend package and declared Python dependencies
- the frontend package and declared npm dependencies

Current limitation:

- this SBOM is based on manifest files in the repository
- it does not yet resolve fully installed transitive dependencies from `pip` or `npm`

## Run Under WSL

If you already have WSL installed, the easiest development workflow is to run both services from Ubuntu or another WSL distro with one script.

### One-time setup inside WSL

Install Python and Node.js if they are not already available:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip npm
```

If you prefer a newer Node.js version, install Node with `nvm` instead of `apt`.

### Start with hot reload

From WSL:

```bash
cd /mnt/c/Users/reneh/Documents/devpacks/umdiecke
chmod +x scripts/dev-wsl.sh
./scripts/dev-wsl.sh
```

## Run With Docker Compose

From the repository root:

```bash
docker compose up --build
```

This starts:

- PostgreSQL on `localhost:5432`
- FastAPI on `http://localhost:8000`
- React/Vite on `http://localhost:5173`
- Swagger UI on `http://localhost:8000/docs`
- MailHog UI on `http://localhost:8025`

For email-based password resets during local development, open MailHog on `http://localhost:8025`.

Stop with:

```bash
docker compose down
```

## Time Tracking

The `Zeiterfassung` or `Time tracking` area is backed by OpenAPI endpoints and PostgreSQL persistence.

Stored per entry:

- start day
- start time
- end day
- end time
- project name
- activity description
- calculated duration in hours

The API also provides:

- the current running entry
- remembered project names
- filtered and paged results
- CSV export of filtered results
- entry editing and deletion

## Profile And Account Management

Authenticated users can now:

- review their stored personal details
- update full name and email address
- change their password
- delete their account with a two-step confirmation dialog

Deleting an account also removes the user's recorded time entries.
