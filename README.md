# Kiyib Kor

Uzbekistan-first virtual fitting studio. Uzbek is the default language, with English available in the header.

## Stack

- Next.js App Router + React + TypeScript; Tailwind CSS v4 for the layout.
- FASHN AI Virtual Try-On v1.6 for photo based garment generation; MediaPipe provides optional on-device live body guidance.
- FastAPI + Pillow for server-side 2D garment compositing.
- PostgreSQL + SQLAlchemy for saved look metadata.
- Cloudinary for saved look images. Credentials stay on the Python server.

The main try-on flow combines a person photo and a real garment photo with FASHN Virtual Try-On v1.6. The AI runs only after the visitor checks the disclosure and requests a generation. The API key stays on FastAPI. Each generation requests one result and costs one FASHN credit. Both input images are sent to FASHN; generated images are returned directly to the browser and are not stored in Cloudinary by this flow. FASHN returns generated CDN images for three days; Kiyib Kor downloads the result and returns it without caching.

Camera frames, body landmarks and photos are processed on-device and stay in the browser until the visitor explicitly saves a look to the cloud. Tracking is throttled to roughly 12 FPS; rendering runs independently. No body means no floating garment in automatic mode. Turn off automatic fitting to use manual position/size/rotation controls. Shoulders and hips must be visible; low light, occlusion, cropped bodies and side views reduce accuracy.

The live view is a fast **approximate alignment preview**; it will not match the photo quality of generated AI try-on. The AI flow requires a real garment product photo. Illustrated wardrobe pieces are previews only. Results are generated images, not body scans, sizing advice, garment measurements or physically simulated fabric.

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

Set a FASHN API key in `backend/.env` to enable AI generation. Get a key from the [FASHN dashboard](https://app.fashn.ai/). Add Cloudinary credentials if you also want to save results to your account. With Docker installed:

```powershell
docker compose up --build
```

This starts PostgreSQL and FastAPI, initializes the tables, and persists PostgreSQL data in a named volume. The default password is only for local development; supply `POSTGRES_PASSWORD` for other environments. Or run PostgreSQL separately, change to `backend/`, and execute:

```powershell
../.venv/Scripts/python.exe -m app.database
../.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs. Configure `CORS_ORIGINS` with the exact frontend origins. Set `NEXT_PUBLIC_API_URL` to this FastAPI origin in the frontend build. Deploy the API container on a Python/container host; the current Sites host serves only the exported frontend. Never put `FASHN_API_KEY` in a frontend `NEXT_PUBLIC_` variable.

## API

| Endpoint | Behavior |
|---|---|
| `GET /health` | API status and storage readiness |
| `POST /api/try-on` | Multipart `person`, transparent `garment`, JSON `transform`; returns an 800×1000 PNG |
| `POST /api/try-on/ai` | Multipart `person`, `garment`, `category`, and `consent`; sends both photos to FASHN only after explicit consent; returns one generated PNG |
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
