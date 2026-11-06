# Kiyib Kor

Uzbekistan-first virtual fitting studio. Uzbek is the default language, with English available in the header.

## Stack

- Next.js App Router + React + TypeScript; Tailwind CSS v4 for the layout.
- FastAPI + Pillow for server-side 2D garment compositing.
- PostgreSQL + SQLAlchemy for saved look metadata.
- Cloudinary for saved look images. Credentials stay on the Python server.

This version uses **2D overlays**, not generative AI or automatic body tracking. Camera frames and photos stay in the browser until the visitor explicitly saves a look to the cloud. The render endpoint can also compose an image without retaining either input. Garment uploads should be transparent PNGs; opaque backgrounds are not automatically removed.

## Frontend

Requires Node.js 20.9+ (Node 24 tested).

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000. Set `NEXT_PUBLIC_API_URL` to the FastAPI origin before building. Leaving it unset enables browser-only fitting and download; cloud save remains disabled. `npm run build` produces `out/`, hosted as a static Next.js export on the existing private Site. `npm start` is not used for static exports. To preview a build, run `python -m http.server 3000 --directory out`.

## Backend

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
Copy-Item backend/.env.example backend/.env
```

Set Cloudinary credentials in `backend/.env`. With Docker installed:

```powershell
docker compose up --build
```

This starts PostgreSQL and FastAPI, initializes the tables, and persists PostgreSQL data in a named volume. The default password is only for local development; supply `POSTGRES_PASSWORD` for other environments. Or run PostgreSQL separately, change to `backend/`, and execute:

```powershell
../.venv/Scripts/python.exe -m app.database
../.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs. Configure `CORS_ORIGINS` with the exact frontend origins. Deploy the API container on a Python/container host and connect a managed PostgreSQL database using `postgresql+psycopg://...`. The current Sites host serves the exported frontend, not Python/PostgreSQL.

## API

| Endpoint | Behavior |
|---|---|
| `GET /health` | API status and storage readiness |
| `POST /api/try-on` | Multipart `person`, transparent `garment`, JSON `transform`; returns an 800×1000 PNG |
| `POST /api/looks` | Multipart `image`, `garment_id`, `transform`; uploads to Cloudinary and records metadata in PostgreSQL |
| `GET /api/looks` | Latest 50 looks for the browser session |
| `DELETE /api/looks/{id}` | Deletes that session's look and Cloudinary image |

Saved-look endpoints require `X-Session-Key`: a random 32-byte hex capability stored in the browser. Only its SHA-256 hash is retained in PostgreSQL. It is a device session, not an account; clearing browser storage loses access to those records. Cloudinary delivery URLs are unguessable but accessible to anyone holding the link. Add account authentication, private asset delivery, rate limits and a retention policy before accepting public production uploads.

The 2D renderer shares the browser's coordinates: width `470 * size / 100`, height `width * 310 / 300`, center X `400 + x`, top `310 + y`; `angle` is clockwise in degrees. Size is 40–160%, X ±250 px, Y −250–300 px, rotation ±45°. Images are limited to 10 MB and 20 megapixels, validated by decoding, and re-encoded without EXIF on cloud save.

## Validation

```powershell
npm run typecheck
npm run build
Push-Location backend
../.venv/Scripts/python.exe -m pytest -q
Pop-Location
```

PostgreSQL/Cloudinary integration requires configured services. Tests cover compositing, transparency, transforms, invalid files, session authorization and unconfigured storage; they do not claim to exercise live cloud credentials.
