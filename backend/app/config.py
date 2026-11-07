from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    database_url: str = ''
    cloudinary_cloud_name: str = ''
    cloudinary_api_key: str = ''
    cloudinary_api_secret: str = ''
    vton_space_url: str = 'https://monk7-vtryon-a.hf.space'
    cors_origins: list[str] = ['http://localhost:3000']
    max_upload_bytes: int = 10 * 1024 * 1024

    @property
    def storage_configured(self) -> bool:
        return bool(self.database_url and self.cloudinary_cloud_name and self.cloudinary_api_key and self.cloudinary_api_secret)

    @property
    def ai_tryon_configured(self) -> bool:
        return bool(self.vton_space_url)

@lru_cache
def settings() -> Settings:
    return Settings()
