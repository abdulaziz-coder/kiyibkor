from io import BytesIO
import json
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.imaging import Transform, compose, decode_image, png

def image_bytes(color='white', size=(800, 1000)):
    return png(Image.new('RGBA', size, color))

def test_compose_position_and_transparency():
    base = Image.new('RGBA', (800,1000), 'white')
    garment = Image.new('RGBA', (300,310), (0,0,0,0))
    garment.paste((255,0,0,255), (100,100,200,200))
    output = compose(base, garment, Transform(x=100, y=50))
    assert output.size == (800,1000)
    assert output.getpixel((500,600))[:3] == (255,0,0)
    assert output.getpixel((200,200))[:3] == (255,255,255)

def test_render_endpoint_returns_png():
    with TestClient(app) as client:
        result = client.post('/api/try-on', files={'person':('person.png',image_bytes(),'image/png'),
                    'garment':('garment.png',image_bytes('green',(300,310)),'image/png')},
                    data={'transform':json.dumps({'size':100,'x':0,'y':0,'angle':15})})
        assert result.status_code == 200
        assert result.headers['content-type'] == 'image/png'
        assert decode_image(result.content).size == (800,1000)
        assert result.headers['cache-control'] == 'no-store'

def test_reject_invalid_image_and_transform():
    with TestClient(app) as client:
        files={'person':('bad.png',b'not an image','image/png'),'garment':('shirt.png',image_bytes(),'image/png')}
        assert client.post('/api/try-on',files=files).status_code == 422
        files['person']=('person.png',image_bytes(),'image/png')
        assert client.post('/api/try-on',files=files,data={'transform':'{"size":999}'}).status_code == 422
        assert client.post('/api/try-on',files=files,data={'transform':'{"x":NaN}'}).status_code == 422

def test_storage_requires_session_key():
    with TestClient(app) as client:
        assert client.get('/api/looks').status_code == 401
        assert client.delete('/api/looks/00000000-0000-0000-0000-000000000000').status_code == 401

def test_health_without_storage(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings(),'database_url','')
    with TestClient(app) as client:
        assert client.get('/health').json() == {'status':'ok','try_on_mode':'2d','storage_ready':False}
        assert client.get('/api/looks',headers={'X-Session-Key':'a'*64}).status_code == 503
