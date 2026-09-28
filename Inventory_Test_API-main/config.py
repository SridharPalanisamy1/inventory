from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    TEST_URI: str
    LIVE_URI: str
    CORS_ALLOWED_ORIGINS: list[str] = []

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
