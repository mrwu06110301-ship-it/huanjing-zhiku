"""用户路由 — 注册、登录、查看"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    UserRegister, UserLogin, UserOut, Token, UserUpdate, PasswordChange,
    SmsSendRequest, SmsLoginRequest, WechatLoginRequest, UsernameCheck,
)
from app.services.auth import hash_password, verify_password, create_access_token
from app.dependencies.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/users", tags=["用户"])

# 短信认证服务开关：开通短信服务后置 True 并接入实际发送通道
SMS_ENABLED = False


@router.post("/register/check-username")
async def check_username(data: UsernameCheck, db: AsyncSession = Depends(get_db)):
    """注册第一步：用户名占用预校验（不创建账号）"""
    username = data.username.strip()
    if len(username) < 3 or len(username) > 50:
        raise HTTPException(status_code=400, detail="用户名需 3-50 个字符")
    result = await db.execute(select(User).where(User.username == username))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="用户名已被注册")
    return {"detail": "用户名可用", "username": username}


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    """注册：手机验证码关联通过后才创建账号并签发 token（自动登录）

    流程：第一步仅预校验用户名（/register/check-username，不建号）；
    第二步手机验证码校验通过后，本接口一次性完成建号 + 写 phone + 发 token。
    """
    # 手机号+验证码必填：验证通过是注册成功的前置条件
    if not SMS_ENABLED:
        raise HTTPException(status_code=501, detail="短信服务暂未开通，注册暂不可用，敬请期待")
    if not data.phone or not data.sms_code:
        raise HTTPException(status_code=400, detail="请先完成手机验证码关联")
    # TODO: 校验 data.sms_code 与下发验证码一致（短信通道接入后补充）
    phone = data.phone.strip()

    username = data.username.strip()
    # 用户名唯一性检查
    result = await db.execute(select(User).where(User.username == username))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="用户名已被注册")

    # 手机号唯一性检查
    result = await db.execute(select(User).where(User.phone == phone))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="手机号已被注册")

    # email 可选：填写了才查重（个人中心补填场景兼容）
    email = (data.email or "").strip()
    if email:
        result = await db.execute(select(User).where(User.email == email))
        if result.scalars().first():
            raise HTTPException(status_code=400, detail="邮箱已被注册")

    user = User(
        username=username,
        email=email,
        phone=phone,
        nickname=data.nickname or username,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@router.post("/login", response_model=Token)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    """登录：账号+密码（账号支持 用户名/手机号/邮箱）"""
    account = (data.account or data.username or "").strip()
    if not account:
        raise HTTPException(status_code=400, detail="请输入账号")
    result = await db.execute(
        select(User).where(
            or_(User.username == account, User.phone == account, User.email == account)
        )
    )
    user = result.scalars().first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="账号或密码错误")

    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


# ========== 短信登录/注册（预留：短信认证服务开通后接入） ==========

@router.post("/sms/send")
async def send_sms(data: SmsSendRequest):
    """发送短信验证码（预留接口，短信服务开通后接入实际通道）"""
    if not SMS_ENABLED:
        raise HTTPException(status_code=501, detail="短信登录暂未开放，敬请期待")
    # TODO: 接入短信服务商，生成验证码存 Redis/内存 并下发
    return {"detail": "验证码已发送"}


@router.post("/sms/login", response_model=Token)
async def sms_login(data: SmsLoginRequest, db: AsyncSession = Depends(get_db)):
    """短信验证码登录/自动注册（预留接口）"""
    if not SMS_ENABLED:
        raise HTTPException(status_code=501, detail="短信登录暂未开放，敬请期待")
    # TODO: 校验验证码 → 已注册直接登录 / 未注册自动创建账号
    raise HTTPException(status_code=501, detail="短信登录暂未开放，敬请期待")


@router.post("/bind-phone")
async def bind_phone(
    data: SmsLoginRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """已注册用户绑定/关联手机号（注册流程第二步，预留接口）

    账号密码注册完成后，通过手机验证码关联手机号。
    短信服务开通后：校验验证码一致才写入 phone；手机号被占用时返回 400。
    """
    if not SMS_ENABLED:
        raise HTTPException(status_code=501, detail="短信服务暂未开通，可稍后在个人中心绑定")
    # TODO: 校验 data.sms_code 与下发验证码一致
    phone = data.phone.strip()
    exists = await db.execute(
        select(User).where(User.phone == phone, User.id != current_user.id)
    )
    if exists.scalars().first():
        raise HTTPException(status_code=400, detail="该手机号已被其他账号绑定")
    current_user.phone = phone
    db.add(current_user)
    await db.commit()
    return {"detail": "手机号绑定成功", "phone": phone}


# ========== 微信扫码登录（预留：微信开放平台接入后启用） ==========

@router.post("/wechat/login", response_model=Token)
async def wechat_login(data: WechatLoginRequest, db: AsyncSession = Depends(get_db)):
    """微信扫码授权登录（预留接口，微信开放平台审核通过后接入）"""
    # TODO: code 换 access_token → 拉用户信息 → 按 openid 查找/创建用户
    raise HTTPException(status_code=501, detail="微信登录暂未开放，敬请期待")


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
async def update_me(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新当前用户个人信息（昵称/邮箱/头像/手机号）"""
    if data.nickname is not None:
        current_user.nickname = data.nickname.strip() or current_user.nickname
    if data.email is not None:
        email = data.email.strip()
        if email:
            exists = await db.execute(
                select(User).where(User.email == email, User.id != current_user.id)
            )
            if exists.scalars().first():
                raise HTTPException(status_code=400, detail="该邮箱已被其他用户使用")
            current_user.email = email
    if data.avatar is not None:
        current_user.avatar = data.avatar
    if data.phone is not None:
        current_user.phone = data.phone.strip()
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.put("/me/password")
async def change_password(
    data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """修改当前用户密码（需验证原密码）"""
    if not verify_password(data.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="原密码错误")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码至少 6 位")
    current_user.hashed_password = hash_password(data.new_password)
    db.add(current_user)
    await db.commit()
    return {"message": "密码修改成功"}


@router.get("/list", response_model=list[UserOut])
async def list_users(
    page: int = 1,
    page_size: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """管理员获取用户列表"""
    result = await db.execute(
        select(User).order_by(User.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )
    return result.scalars().all()


@router.get("/count")
async def count_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    total = await db.execute(select(User))
    return {"total": len(total.scalars().all())}


@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user
