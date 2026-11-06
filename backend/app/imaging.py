from io import BytesIO
import warnings
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field, ConfigDict

class Transform(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    size: float = Field(default=100, ge=40, le=160)
    x: float = Field(default=0, ge=-250, le=250)
    y: float = Field(default=0, ge=-250, le=300)
    angle: float = Field(default=0, ge=-45, le=45)

def decode_image(data: bytes) -> Image.Image:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as source:
                if source.format not in {'PNG', 'JPEG', 'WEBP'}:
                    raise ValueError('Use PNG, JPEG or WebP images.')
                if source.width * source.height > 20_000_000:
                    raise ValueError('Image exceeds 20 megapixels.')
                return ImageOps.exif_transpose(source).convert('RGBA')
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError('Invalid or oversized image.') from exc

def png(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format='PNG')
    return output.getvalue()

def compose(person: Image.Image, garment: Image.Image, transform: Transform) -> Image.Image:
    """Match the browser's 800x1000 coordinates; positive angle rotates clockwise."""
    base = ImageOps.fit(person, (800, 1000), method=Image.Resampling.LANCZOS)
    width = round(470 * transform.size / 100)
    height = round(width * 310 / 300)
    layer = garment.resize((width, height), Image.Resampling.LANCZOS)
    layer = layer.rotate(-transform.angle, resample=Image.Resampling.BICUBIC, expand=True)
    center_x = 400 + transform.x
    center_y = 310 + transform.y + height / 2
    base.alpha_composite(layer, (round(center_x-layer.width/2), round(center_y-layer.height/2)))
    return base
