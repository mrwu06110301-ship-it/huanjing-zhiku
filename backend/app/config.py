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

    # 阿里云号码认证服务（短信认证）：凭证建议用 systemd 环境变量注入，勿写死
    SMS_ENABLED: bool = False  # 总开关：凭证配好后置 True
    SMS_ACCESS_KEY_ID: str = ""
    SMS_ACCESS_KEY_SECRET: str = ""
    SMS_SIGN_NAME: str = ""  # 控制台"赠送签名"名称，如"恒创联众"
    SMS_TEMPLATE_CODE: str = ""  # 控制台"赠送模板"Code，如 100001
    SMS_SCHEME_NAME: str = ""  # 认证方案名，默认方案留空即可
    SMS_CODE_TTL_MIN: int = 5  # 验证码有效期（分钟）

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
