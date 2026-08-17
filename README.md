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

- `/ai` is gated client-side (`AuthGate`, plus the page not being reachable by customers through normal navigation) but the backend routes behind it (the AI service) do not themselves check for an admin token — don't rely on this for anything security-sensitive until that's added.
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
# Terminal 1 — Backend
cd backend
npm install
npm run dev
# Runs at http://localhost:4000

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
# Runs at http://localhost:5173

# Terminal 3 — AI processing service
cd backend
# Recommended: use the Python 3.12 environment with the AI dependencies installed.
# Create it once if it does not exist:
# python3.12 -m venv venv-new
source venv-new/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# Runs at http://localhost:8000
```

The AI service requires Python 3.12 with the packages in `backend/requirements.txt`.
`backend/venv-new` is the recommended local environment. `backend/venv312` is an older
`uv`-managed Python 3.12 environment with the same dependencies, while `backend/venv313`
is only a bare Python 3.13 environment and is not sufficient for this service. Virtual
environments are local-only and must not be committed.

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
| `WHISPER_LANGUAGE` | Whisper language hint for AI transcription | Leave as `ms` for Malay/English food content |
| `PORT` | Server port (default 4000) | Leave as `4000` |

---

### `frontend/.env`

| Variable | Description | How to get |
|---|---|---|
| `VITE_MAPS_BROWSER_KEY` | Google Maps browser key | Ask Tan Zheng Yang |
| `VITE_API_BASE` | Backend URL | Leave as `http://localhost:4000` |
| `VITE_AI_API_BASE` | FastAPI AI processing URL | Leave as `http://localhost:8000/api` |

> The frontend does **not** need Supabase keys — all database access goes through the backend.

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
