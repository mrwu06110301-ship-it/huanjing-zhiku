"""用户相关 Schema"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., min_length=5, max_length=100)
    password: str = Field(..., min_length=6, max_length=100)
    nickname: str = Field(default="", max_length=50)


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    nickname: str
    avatar: str = ""
    role: str = "user"
    is_active: bool = True
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    nickname: str | None = None
    avatar: str | None = None
    email: str | None = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
