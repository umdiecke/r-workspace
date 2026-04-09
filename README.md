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

The application version follows SemVer and is currently `1.2.0`.

## Backend

### Features

- Public heartbeat endpoint at `GET /api/heartbeat`
- OAuth2 token endpoint at `POST /oauth/token`
- Protected user endpoint at `GET /api/me`
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

## Frontend

### Run

```powershell
cd frontend
npm install
npm run dev
```

The UI will be available at `http://localhost:5173`.

## Important endpoints

- `GET /api/heartbeat`
- `POST /oauth/token`
- `GET /api/me`
- `GET /api/time-entries/active`
- `POST /api/time-entries/start`
- `POST /api/time-entries/{entry_id}/stop`
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
