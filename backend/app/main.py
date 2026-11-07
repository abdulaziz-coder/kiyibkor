from contextlib import asynccontextmanager
from hashlib import sha256
from io import BytesIO
import re
import uuid
import logging
import asyncio
import base64
import httpx
import cloudinary
import cloudinary.uploader
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from .config import settings
from .database import Look, engine
from .imaging import Transform, compose, decode_image, png

log = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app):
    cfg = settings()
    cloudinary.config(cloud_name=cfg.cloudinary_cloud_name, api_key=cfg.cloudinary_api_key,
                      api_secret=cfg.cloudinary_api_secret, secure=True)
    yield

app = FastAPI(title='Kiyib Kor API', version='0.2.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings().cors_origins,
                   allow_methods=['GET', 'POST', 'DELETE'], allow_headers=['Content-Type', 'X-Session-Key'])

def owner(key: str) -> str:
    if not re.fullmatch(r'[a-f0-9]{64}', key):
        raise HTTPException(401, 'A valid X-Session-Key is required.')
    return sha256(key.encode()).hexdigest()

def require_storage():
    if not settings().storage_configured:
        raise HTTPException(503, 'PostgreSQL and Cloudinary are not configured.')

async def read_image(file: UploadFile):
    try:
        data = await file.read(settings().max_upload_bytes + 1)
    finally:
        await file.close()
    if len(data) > settings().max_upload_bytes:
        raise HTTPException(413, 'Image exceeds the upload limit.')
    try:
        return await run_in_threadpool(decode_image, data)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

def parse_transform(value: str) -> Transform:
    try:
        return Transform.model_validate_json(value)
    except ValidationError as exc:
        raise HTTPException(422, 'Invalid garment transform.') from exc

@app.get('/health')
def health():
    ready = False
    if settings().storage_configured:
        try:
            with engine().connect() as conn:
                conn.execute(select(Look.id).limit(1))
            ready = True
        except Exception:
            log.warning('Database readiness check failed.')
    return {'status': 'ok', 'try_on_mode': 'ai-photo', 'ai_tryon_ready': settings().ai_tryon_configured, 'storage_ready': ready}

@app.post('/api/try-on/ai')
async def ai_try_on(person: UploadFile = File(...), garment: UploadFile = File(...),
                    consent: bool = Form(...), category: str = Form('auto')):
    cfg = settings()
    if not cfg.ai_tryon_configured:
        raise HTTPException(503, 'AI try-on is not configured yet. Add FASHN_API_KEY to backend/.env.')
    if not consent:
        raise HTTPException(400, 'Consent is required before sending photos to the AI try-on provider.')
    if category not in {'auto', 'tops', 'bottoms', 'one-pieces'}:
        raise HTTPException(422, 'Choose a supported garment category.')
    person_image = await read_image(person)
    garment_image = await read_image(garment)
    model_data = 'data:image/png;base64,' + base64.b64encode(await run_in_threadpool(png, person_image)).decode()
    garment_data = 'data:image/png;base64,' + base64.b64encode(await run_in_threadpool(png, garment_image)).decode()
    headers = {'Authorization': f'Bearer {cfg.fashn_api_key}'}
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0), follow_redirects=False) as client:
        try:
            started = await client.post('https://api.fashn.ai/v1/run', headers=headers, json={
                'model_name': 'tryon-v1.6',
                'inputs': {'model_image': model_data, 'garment_image': garment_data,
                           'category': category, 'garment_photo_type': 'auto', 'mode': 'quality',
                           'num_samples': 1, 'output_format': 'png', 'moderation_level': 'conservative'}})
        except httpx.HTTPError as exc:
            raise HTTPException(502, 'Could not reach the AI try-on provider.') from exc
        if started.status_code >= 400:
            raise HTTPException(502, 'AI provider rejected the request. Check the API key and account credits.')
        prediction_id = started.json().get('id')
        if not isinstance(prediction_id, str):
            raise HTTPException(502, 'AI provider returned an invalid job.')
        for _ in range(36):
            await asyncio.sleep(2)
            try:
                polled = await client.get(f'https://api.fashn.ai/v1/status/{prediction_id}', headers=headers)
            except httpx.HTTPError as exc:
                raise HTTPException(502, 'Lost connection while checking the AI result.') from exc
            if polled.status_code >= 400:
                raise HTTPException(502, 'Could not retrieve the AI try-on result.')
            result = polled.json()
            if result.get('status') == 'failed':
                raise HTTPException(422, 'AI could not fit this garment. Try clear, front-facing photos with the full garment visible.')
            if result.get('status') == 'completed':
                outputs = result.get('output')
                if not isinstance(outputs, list) or not outputs or not isinstance(outputs[0], str):
                    raise HTTPException(502, 'AI provider did not return an image.')
                output_url = httpx.URL(outputs[0])
                if output_url.scheme != 'https' or output_url.host not in {'cdn.fashn.ai', 'media.fashn.ai'}:
                    raise HTTPException(502, 'AI provider returned an unexpected result URL.')
                try:
                    generated = await client.get(output_url)
                    generated.raise_for_status()
                except httpx.HTTPError as exc:
                    raise HTTPException(502, 'Could not download the generated image.') from exc
                if len(generated.content) > cfg.max_upload_bytes:
                    raise HTTPException(502, 'Generated image exceeded the download limit.')
                try:
                    output = await run_in_threadpool(decode_image, generated.content)
                except ValueError as exc:
                    raise HTTPException(502, 'AI provider returned an invalid image.') from exc
                return Response(await run_in_threadpool(png, output), media_type='image/png',
                                headers={'Cache-Control': 'no-store'})
        raise HTTPException(504, 'AI try-on took too long. Please try again.')

@app.post('/api/try-on')
async def try_on(person: UploadFile = File(...), garment: UploadFile = File(...), transform: str = Form('{}')):
    placement = parse_transform(transform)
    person_image = await read_image(person)
    garment_image = await read_image(garment)
    result = await run_in_threadpool(compose, person_image, garment_image, placement)
    return Response(await run_in_threadpool(png, result), media_type='image/png',
                    headers={'Cache-Control': 'no-store'})

def look_data(look: Look):
    return {'id': look.id, 'image_url': look.image_url, 'garment_id': look.garment_id,
            'transform': look.transform, 'created_at': look.created_at}

@app.post('/api/looks', status_code=201)
async def save_look(image: UploadFile = File(...), garment_id: str = Form(..., max_length=100),
                    transform: str = Form('{}'), x_session_key: str = Header(default='')):
    owner_hash = owner(x_session_key)
    require_storage()
    placement = parse_transform(transform)
    decoded = await read_image(image)
    # Re-encode to strip EXIF and reject disguised non-image payloads.
    data = await run_in_threadpool(png, decoded)
    def save():
        public_id = 'kiyib-kor/looks/' + str(uuid.uuid4())
        uploaded = None
        try:
            uploaded = cloudinary.uploader.upload(BytesIO(data), public_id=public_id, resource_type='image')
            with Session(engine()) as db:
                look = Look(owner_hash=owner_hash, garment_id=garment_id, transform=placement.model_dump(),
                            image_url=uploaded['secure_url'], cloudinary_public_id=uploaded['public_id'])
                db.add(look)
                db.commit()
                db.refresh(look)
                return look_data(look)
        except Exception as exc:
            if uploaded:
                try:
                    cloudinary.uploader.destroy(uploaded['public_id'], invalidate=True)
                except Exception:
                    log.error('Compensating Cloudinary cleanup failed.')
            log.error('Cloud save failed: %s', type(exc).__name__)
            raise HTTPException(503, 'Storage is temporarily unavailable.') from exc
    return await run_in_threadpool(save)

@app.get('/api/looks')
def list_looks(x_session_key: str = Header(default='')):
    owner_hash = owner(x_session_key)
    require_storage()
    try:
        with Session(engine()) as db:
            return [look_data(row) for row in db.scalars(select(Look).where(Look.owner_hash == owner_hash)
                    .order_by(Look.created_at.desc()).limit(50))]
    except Exception as exc:
        raise HTTPException(503, 'Storage is temporarily unavailable.') from exc

@app.delete('/api/looks/{look_id}', status_code=204)
def delete_look(look_id: uuid.UUID, x_session_key: str = Header(default='')):
    owner_hash = owner(x_session_key)
    require_storage()
    with Session(engine()) as db:
        look = db.scalar(select(Look).where(Look.id == str(look_id), Look.owner_hash == owner_hash))
        if not look:
            raise HTTPException(404, 'Look not found.')
        try:
            result = cloudinary.uploader.destroy(look.cloudinary_public_id, invalidate=True)
            if result.get('result') not in {'ok', 'not found'}:
                raise RuntimeError('Image deletion failed')
            db.delete(look)
            db.commit()
        except Exception as exc:
            raise HTTPException(503, 'Could not delete this look. Please retry.') from exc
    return Response(status_code=204)
