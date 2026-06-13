"""应用配置"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """应用配置，可通过环境变量覆盖"""

    # 应用信息
    APP_NAME: str = "环监智库"
    APP_SLOGAN: str = "让现场监测，触手可感"
    APP_VERSION: str = "2.0.0"

    # 数据库
    DATABASE_URL: str = "sqlite+aiosqlite:///./hjzk.db"

    # JWT 认证
    SECRET_KEY: str = "hjzk-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 天

    # 分页
    DEFAULT_PAGE_SIZE: int = 10

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
    ]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
