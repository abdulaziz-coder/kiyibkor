from datetime import datetime
from functools import lru_cache
import uuid
from sqlalchemy import DateTime, String, JSON, create_engine, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from .config import settings

class Base(DeclarativeBase):
    pass

class Look(Base):
    __tablename__ = 'looks'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_hash: Mapped[str] = mapped_column(String(64), index=True)
    garment_id: Mapped[str] = mapped_column(String(100))
    image_url: Mapped[str] = mapped_column(String(2048))
    cloudinary_public_id: Mapped[str] = mapped_column(String(256))
    transform: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

@lru_cache
def engine():
    url = settings().database_url
    if not url.startswith('postgresql+psycopg://'):
        raise RuntimeError('DATABASE_URL must use postgresql+psycopg://')
    return create_engine(url, pool_pre_ping=True, connect_args={'connect_timeout': 5})

if __name__ == '__main__':
    Base.metadata.create_all(engine())
    print('Kiyib Kor database tables are ready.')
