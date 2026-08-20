# TrueBites — Restaurant Navigation

A self-pickup and dine-in restaurant discovery app with in-app map, route planning, and day/night mode.

## Contributors

| Module | Member | Responsibility |
|---|---|---|
| Map/Navigation — Backend | Tan Zheng Yang | Express API, Google Geocoding API, Haversine proximity sort, Google Directions API, Supabase integration |
| Map/Navigation — Frontend | Ng Chi Hao | Google Maps UI, restaurant markers, route polyline, RoutePanel, day/night mode |
| Auth | Joshua | Login, register, session management |
| Vendors | Toh Lian Thing | Vendor listings and management |
| AI Content Processing | Tan Chun Jie | Video URL submission, speech-to-text, summarization, info extraction |
| Engagement & Bookmarking | Khor Yik Qi | Wishlist folders, star ratings, reviews, photo upload, helpful likes |

## Member contribution log
JOSHUA - I have added a frontend for login page. I just need Tan Zheng Yang's Supabase access to do backend.

## Tech Stack

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React + Vite | Map UI, restaurant markers, route display |
| Map Engine | Google Maps JS SDK (`@react-google-maps/api`) | In-app map, polylines, day/night style |
| Backend | Node.js + Express | Geocoding, proximity sort, Directions API |
| Database | Supabase (PostgreSQL + PostGIS) | Restaurant locations with spatial indexing |
| Proximity Sort | Haversine Formula | Sort restaurants by distance — no API cost |
| Geocoding | Google Geocoding API | Address → coordinates (once on insert) |
| Route Planning | Google Directions API | Real road distance, ETA, and route polyline |

## Features

- In-app navigation — no redirect to native Maps app
- Restaurant markers sorted by Haversine distance
- Real route polyline, distance, and ETA via Google Directions API
- Day/Night map mode — auto-detects OS preference, manual toggle available
- Night style is hardcoded in `MapPage.jsx` — no configuration needed

### Community vendor suggestions

Customers can submit a hidden-gem vendor from the customer home flow at `/suggestions/new`.
The submission is limited to a Malacca/Melaka location and a TikTok or YouTube source URL.
Customers can only see their own submission status; they never access the AI processing console.

Admins review the queue at `/admin/suggestions`, then can accept a submission for the existing
AI transcript/summary/extraction workflow, inspect the result, create a vendor draft, and publish
it as an active vendor. This keeps AI as an admin assistant while human review controls publication.

The database migration is `supabase/migrations/202608180001_vendor_suggestions.sql`. Apply it to
the Supabase project used by `backend/.env` before using the feature. The Node API owns the
customer/admin authorization boundaries and the table also has RLS policies as defense in depth.

---

## Authentication & Roles

Auth is backed directly by **Supabase Auth** (no custom sessions/JWTs of our own). There are three account tiers, all distinguished by `app_metadata.role` on the Supabase user — a field that can **only** be set server-side with the service key, so no user can ever grant themselves elevated access by editing their own profile.

| Role | Value in `app_metadata.role` | Who creates the account | Lands on |
|---|---|---|---|
| Customer | *(none)* | Self-service — `/login` (email/password or Google) | `/map` |
| Admin | `"admin"` | Invited by a superadmin | `/admin` |
| Superadmin | `"superadmin"` | Seeded manually (see below) | `/superadmin` |

### Customer auth — `/login`

- Tabbed **Sign In / Create Account** form (`LoginPage.jsx`). Always opens on **Sign In**, regardless of how you navigated there (including the "Sign Up" button elsewhere in the app) — there is no way to land on the Create Account tab by refreshing or re-visiting the page.
- Google OAuth is also available for customers.
- **Onboarding gate**: any email/password account without `user_metadata.first_name` is force-redirected to `/onboarding` the moment a session appears, wherever it appears (login, confirmation-link redirect, etc.). Onboarding collects first/last name and date of birth (`OnboardingPage.jsx` + `DobScrollPicker.jsx`), then sends the user to `/map`. Google accounts and admin/superadmin accounts are exempt.
- **Account deletion** is self-service from `/profile`, calling `DELETE /api/account` with the caller's access token (backend uses the Supabase service key to actually remove the auth user — see `backend/routes/auth.js`). A user can only ever delete their own account; the route derives the target id from the token, never from the request body.

### Admin auth — `/admin-login`

- Separate login form (`AdminLoginPage.jsx`) — same Supabase `signInWithPassword` call as customers, but afterward checks `app_metadata.role`. Anyone without `"admin"` or `"superadmin"` is immediately signed back out with "This account is not authorized for admin access."
- **First login after being invited**: every new admin is created with `user_metadata.must_change_password: true` and an initial password equal to their email address. On first successful sign-in they're forced to `/admin-set-password` before reaching anything else (`SetAdminPasswordPage.jsx`).
- After that, regular admins land on **`/admin`**, the operational console containing Overview, Vendors, AI Content Queue, Reviews, and Settings. Superadmins land on **`/superadmin`** for admin-account management.
- **Logout is available from the admin landing pages** — the AI and Vendor pages use a Back action to return to the appropriate admin area. This is enforced by convention in the UI, not by removing `supabase.auth.signOut()` capability elsewhere.
- **Route guard**: `AuthGate` in `App.jsx` runs on every route change. Admin/superadmin sessions are restricted to the admin login, password setup, `/admin`, `/admin/*`, and `/ai` routes. They cannot reach `/map`, `/profile`, `/onboarding`, or other customer pages by typing the URL directly.

### Superadmin — admin management

Superadmins manage the admin roster from `/superadmin` (`SuperAdminPage.jsx`), backed by `backend/routes/admin.js` and gated by `backend/middleware/requireRole.js`:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/admins` | List all `"admin"`-role accounts |
| `POST` | `/api/admin/admins` | Invite a new admin by email (fails with `409` if the email already has *any* account — this never overwrites an existing user) |
| `DELETE` | `/api/admin/admins/:id` | Remove an admin account (a superadmin can't remove their own account) |

`requireRole(...roles)` verifies the caller's Supabase access token server-side and checks `app_metadata.role` against an allow-list before letting the request through — every admin-management route requires a valid `superadmin` token.

### Seeding the first superadmin

There's no UI for creating the very first superadmin (a superadmin can't invite another superadmin — only regular admins). Run this once, locally, with the backend's `.env` configured:

```bash
cd backend
node scripts/seedSuperAdmin.js
```

This creates `admin@gmail.com` / `adminn` with `app_metadata.role: "superadmin"` via the service key, and no-ops if that account already exists. Change the `EMAIL`/`PASSWORD` constants at the top of the script before running it for a real deployment — the defaults are for local dev only.

### Known limitations

- There's currently no way to promote an *existing* customer account to admin — `POST /api/admin/admins` only creates brand-new accounts and returns `409` if the email is already registered.

---

## Team Workflow (for all teammates)

### 1. Clone the repo

```bash
git clone https://github.com/TanZhengYang0912/Collaborative-Assignment.git
cd Collaborative-Assignment
```

### 2. Create your own feature branch from main

```bash
git checkout main
git pull origin main
git checkout -b feature/your-module-name
```

Each person works on their own branch. Never commit directly to `main`.

### 3. Set up environment variables

```bash
# Copy the templates
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Then fill in the values — see the sections below.

### 4. Install dependencies and start the app

```bash
# Terminal 1 — Backend (includes the AI content pipeline)
cd backend
npm install
npm run dev
# Runs at http://localhost:4000

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
# Runs at http://localhost:5173
```

The AI content pipeline (video download, transcription, extraction) runs in-process in
the Node backend under `/api/ai` — no separate service or window needed, and no OS-level
tools to install by hand:

- **yt-dlp** — fetched automatically into `backend/bin/` by a `postinstall` hook, so a
  plain `npm install` gets it (re-run `npm run setup:ytdlp` any time to re-fetch, e.g. if
  TikTok extraction breaks and a newer build is needed).
- **ffmpeg** / **ffprobe** — bundled via the `ffmpeg-static` / `ffprobe-static` npm
  packages (prebuilt binaries for win32/darwin/linux, no system package manager, no
  Docker). Set `FFMPEG_PATH`/`FFPROBE_PATH` only if you need to override this.

It also needs a `GROQ_API_KEY` (used for both transcription and vendor-info extraction —
see `backend/.env.example`).

### Deploy the Node API to Render

The repository root contains `render.yaml`, which deploys only the Node/Express API.
Create a Render Blueprint from this repository and provide these secret values when
Render prompts for them:

| Variable | Purpose |
|---|---|
| `GOOGLE_API_KEY` | Server-side Geocoding and Directions key |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service-role key; never expose this to Vite |

The Blueprint uses `backend` as its root directory, runs `npm ci`, and starts the API
with `npm start`. Render supplies `PORT`; do not hard-code it. Once deployment succeeds,
set the Vercel frontend variable below and redeploy the frontend:

```dotenv
VITE_API_BASE=https://your-render-service.onrender.com
```

Do not append `/api`; the frontend API modules add that path themselves. Set
`GROQ_API_KEY` on the Render service too if you want the AI content pipeline to work in
production — yt-dlp and ffmpeg/ffprobe are both npm-bundled binaries now (see above), not
system packages, so `npm ci` on Render's plain Node runtime should fetch them with no
Docker or custom buildpack needed. Not yet verified against a real Render deploy, though —
if the build environment blocks outbound network access during `npm ci`, ffmpeg-static's
own install script has no fallback and would fail the build; check the deploy logs the
first time.

### 5. When your feature is ready, push and open a PR

```bash
git add .
git commit -m "feat: describe your feature"
git push origin feature/your-module-name
```

Then open a Pull Request on GitHub to merge into `main`.

---

## Environment Variables

### `backend/.env`

| Variable | Description | How to get |
|---|---|---|
| `GOOGLE_API_KEY` | Server-side key for Geocoding API + Directions API | Ask Tan Zheng Yang |
| `SUPABASE_URL` | Supabase project URL | Ask Tan Zheng Yang |
| `SUPABASE_SERVICE_KEY` | Supabase secret key (never committed) | Ask Tan Zheng Yang |
| `GROQ_API_KEY` | Groq API key — powers AI transcription (Whisper) and vendor-info extraction | https://console.groq.com |
| `WHISPER_LANGUAGE` | Whisper language hint for AI transcription | Leave as `ms` for Malay/English food content |
| `YTDLP_PATH` | Override path to a yt-dlp binary | Leave unset — `npm run setup:ytdlp` fetches one into `backend/bin/` |
| `PUBLIC_BASE_URL` | Base URL used to build links to extracted gallery-photo frames | Leave unset locally; set to the deployed backend URL in production |
| `AI_OUTPUTS_TTL_HOURS` | Hours to keep AI job artifacts on disk before the sweeper deletes them | Leave unset (defaults to 24) |
| `PORT` | Server port (default 4000) | Leave as `4000` |

---

### `frontend/.env`

| Variable | Description | How to get |
|---|---|---|
| `VITE_MAPS_BROWSER_KEY` | Google Maps browser key | Ask Tan Zheng Yang |
| `VITE_MAP_ID` | Google Maps map ID | Google Maps Platform console |
| `VITE_API_BASE` | Node backend URL (also serves the AI pipeline under `/api/ai`) | Local: `http://localhost:4000`; production: Render service URL |
| `VITE_SUPABASE_URL` | Supabase project URL used by browser auth | Supabase project settings |
| `VITE_SUPABASE_ANON_KEY` | Supabase public/anon key used by browser auth | Supabase project settings |

> Never place `SUPABASE_SERVICE_KEY`, `GOOGLE_API_KEY`, or `GROQ_API_KEY` in a
> `VITE_*` variable. Vite variables are embedded in the public browser bundle.

---

## Adding Restaurants to Supabase

Only the project owner needs to do this. Restaurants are stored permanently — geocoding runs once on insert.

**Windows (PowerShell):**
```powershell
Invoke-WebRequest -Uri http://localhost:4000/api/restaurants `
  -Method POST `
  -ContentType 'application/json' `
  -Body '{"name": "Jonker 88", "address": "88 Jalan Hang Jebat, Melaka"}'
```

**Mac / Linux:**
```bash
curl -X POST http://localhost:4000/api/restaurants \
  -H "Content-Type: application/json" \
  -d '{"name": "Jonker 88", "address": "88 Jalan Hang Jebat, Melaka"}'
```

---

## Database Setup (first time only)

Run this once in **Supabase → SQL Editor**:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE restaurants (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  address     TEXT NOT NULL,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  location    GEOGRAPHY(Point, 4326),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE POLICY "Allow public read" ON restaurants FOR SELECT USING (true);
CREATE POLICY "Allow backend insert" ON restaurants FOR INSERT WITH CHECK (true);
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/restaurants` | Add restaurant (geocodes address, stores in Supabase) |
| `GET` | `/api/restaurants/nearby?lat=&lng=` | Return nearest restaurants sorted by Haversine |
| `GET` | `/api/route?fromLat=&fromLng=&toLat=&toLng=` | Return road distance, ETA, and route polyline |
| `DELETE` | `/api/account` | Delete the calling user's own Supabase auth account (token-derived id only) |
| `POST` | `/api/suggestions` | *(customer)* Submit a Malacca vendor suggestion |
| `GET` | `/api/suggestions/mine` | *(customer)* List the calling user's own suggestions |
| `GET` | `/api/suggestions/:id` | *(customer)* Read one owned suggestion |
| `GET` | `/api/admin/suggestions` | *(admin)* Review the suggestion queue |
| `PATCH` | `/api/admin/suggestions/:id/status` | *(admin)* Move a suggestion through review states |
| `POST` | `/api/admin/suggestions/:id/process` | *(admin)* Start/retry AI processing through the Node proxy |
| `GET` | `/api/admin/suggestions/:id/processing` | *(admin)* Read processing status and update the queue state |
| `POST` | `/api/admin/suggestions/:id/create-draft` | *(admin)* Create a vendor draft after human review |
| `POST` | `/api/admin/suggestions/:id/publish` | *(admin)* Activate the linked vendor and publish the suggestion |
| `GET` | `/api/admin/admins` | *(superadmin)* List all admin accounts |
| `POST` | `/api/admin/admins` | *(superadmin)* Invite a new admin by email |
| `DELETE` | `/api/admin/admins/:id` | *(superadmin)* Remove an admin account |

See [Authentication & Roles](#authentication--roles) above for how sign-in, onboarding, and the admin hierarchy fit together.

---

## Project Structure

```
Collaborative-Assignment/
├── backend/
│   ├── server.js               # Entry point — mounts all route modules
│   ├── routes/
│   │   ├── map.js              # Map module        (Tan Zheng Yang) — restaurants, route
│   │   ├── auth.js             # Auth module        (Joshua)         — account deletion
│   │   ├── admin.js            # Auth module        (Joshua)         — superadmin: invite/list/remove admins
│   │   ├── vendors.js          # Vendors module     (Toh Lian Thing) — vendor routes
│   │   ├── ai.js               # AI module          (Tan Chun Jie)   — video URL, transcribe, summarize, extract
│   │   └── engagement.js       # Engagement module  (Khor Yik Qi)    — wishlist, reviews, likes
│   ├── middleware/
│   │   └── requireRole.js      # Auth module        (Joshua)         — token→role check for admin routes
│   ├── scripts/
│   │   └── seedSuperAdmin.js   # Auth module        (Joshua)         — one-off: create the first superadmin
│   ├── supabase.js             # Supabase client
│   ├── haversine.js            # Haversine distance formula
│   ├── .env                    # Real keys — never committed
│   └── .env.example            # Template for teammates
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Router + AuthGate — wires all pages, enforces onboarding/admin routing
│   │   ├── api.js              # fetch wrappers for backend endpoints
│   │   ├── lib/
│   │   │   ├── theme.js            # Shared design tokens (navy/gold/cream)
│   │   │   └── adminNav.js         # Auth module        (Joshua)         — role-aware "back to admin home" helper
│   │   ├── pages/
│   │   │   ├── MapPage.jsx             # Map module        (Tan Zheng Yang) — full map UI
│   │   │   ├── LoginPage.jsx           # Auth module        (Joshua)         — customer sign in / create account
│   │   │   ├── OnboardingPage.jsx      # Auth module        (Joshua)         — forced name/DOB collection
│   │   │   ├── AdminLoginPage.jsx      # Auth module        (Joshua)         — admin/superadmin sign in
│   │   │   ├── SuperAdminPage.jsx      # Auth module        (Joshua)         — invite/list/remove admins + logout
│   │   │   ├── SetAdminPasswordPage.jsx# Auth module        (Joshua)         — forced first-login password change
│   │   │   ├── ProfilePage.jsx         # Auth module        (Joshua)         — profile + account deletion
│   │   │   ├── AIPage.jsx              # AI module          (Tan Chun Jie)   — video submit + results
│   │   │   └── EngagementPage.jsx      # Engagement module  (Khor Yik Qi)    — wishlist, reviews, likes
│   │   └── components/
│   │       ├── DobScrollPicker.jsx     # Auth module        (Joshua)         — DOB input for onboarding
│   │       ├── admin/                  # Admin console layout, charts, and pages
│   │       ├── ai/                     # AI processing workflow steps
│   │       ├── discovery/              # Discovery filters, cards, and vendor detail
│   │       └── engagement/             # Reviews, ratings, folders, and toast UI
│   ├── .env                    # Real keys — never committed
│   └── .env.example            # Template for teammates
└── README.md
```
