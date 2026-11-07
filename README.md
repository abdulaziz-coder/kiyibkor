# Kiyib Kor

Uzbekistan-first virtual fitting studio. Uzbek is the default language, with English available in the header.

## Stack

- Next.js App Router + React + TypeScript; Tailwind CSS v4 for the layout.
- Three.js for volumetric garments; MediaPipe Pose Landmarker for on-device body tracking.
- FastAPI + Pillow for server-side 2D garment compositing.
- PostgreSQL + SQLAlchemy for saved look metadata.
- Cloudinary for saved look images. Credentials stay on the Python server.

The default **3D AR mode** automatically positions and deforms a procedural torso and sleeves using detected shoulders, hips, elbows, wrists and landmark depth. Lighting gives the garments volume; a rotating demo is available without camera access. Switching to 2D keeps automatic body alignment. Uploaded garment photos remain 2D (a photo does not contain a 3D garment mesh).

Camera frames, body landmarks and photos are processed on-device and stay in the browser until the visitor explicitly saves a look to the cloud. Tracking is throttled to roughly 12 FPS; rendering runs independently. No body means no floating garment in automatic mode. Turn off automatic fitting to use manual position/size/rotation controls. Shoulders and hips must be visible; low light, occlusion, cropped bodies and side views reduce accuracy.

This is an approximate AR preview, **not fabric physics, body scanning, a size guarantee, or generative photorealistic try-on**. Built-in garments are procedural volumes, not measured patterns or digitized products. Hands and hair are not segmented for front-of-garment occlusion. The existing Python `/api/try-on` endpoint remains 2D; 3D rendering runs in the browser and saved cloud images are flattened snapshots. Garment uploads should be transparent PNGs; opaque backgrounds are not automatically removed.

`postinstall` runs `scripts/prepare-assets.mjs`: it copies the installed MediaPipe WASM runtime and downloads Google's version-1 Pose Landmarker Lite model to ignored `public/mediapipe/`. These files are served locally, not from a CDN at runtime. Rerun that script if downloads were unavailable during installation. See [Google's model documentation](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker) and [MediaPipe source/license](https://github.com/google-ai-edge/mediapipe).

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
npm test
npm run build
Push-Location backend
../.venv/Scripts/python.exe -m pytest -q
Pop-Location
```

PostgreSQL/Cloudinary integration requires configured services. Tests cover compositing, transparency, transforms, invalid files, session authorization and unconfigured storage; they do not claim to exercise live cloud credentials.
