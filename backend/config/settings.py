"""
Configuração do Django para o backend do CRM Funil de Resgate.

Projeto standalone que espelha a stack do ConectaAP (DRF + SimpleJWT + CORS),
mas com projeto/settings próprios e usuário padrão do Django (auth.User).

Config via variáveis de ambiente (.env). Default roda com SQLite, zero setup.
"""
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv
import os

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name: str, default: str = "") -> list[str]:
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# === Núcleo ===
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-inseguro-troque-em-producao")
DEBUG = _env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = _env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

# Render injeta o hostname do serviço aqui — adiciona automaticamente.
_render_host = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
if _render_host:
    ALLOWED_HOSTS.append(_render_host)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Terceiros
    "rest_framework",
    "corsheaders",
    # Apps do projeto
    "apps.crm",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # WhiteNoise serve os arquivos estáticos (admin) em produção.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# === Banco de dados ===
# Prioridade: DATABASE_URL (ex.: string do Supabase) > CRM_DB_ENGINE=postgres > SQLite.
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

if DATABASE_URL:
    from urllib.parse import unquote, urlparse

    _u = urlparse(DATABASE_URL)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": (_u.path or "/postgres").lstrip("/") or "postgres",
            "USER": unquote(_u.username or ""),
            "PASSWORD": unquote(_u.password or ""),
            "HOST": _u.hostname or "",
            "PORT": str(_u.port or 5432),
            # CONN_MAX_AGE=0 é seguro com os poolers do Supabase.
            "CONN_MAX_AGE": 0,
            "OPTIONS": {"sslmode": os.environ.get("DB_SSLMODE", "require")},
        }
    }
elif os.environ.get("CRM_DB_ENGINE", "sqlite").strip().lower() == "postgres":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("POSTGRES_DB", "crm_funil"),
            "USER": os.environ.get("POSTGRES_USER", "crm"),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "crm"),
            "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
            "OPTIONS": {"sslmode": os.environ.get("DB_SSLMODE", "prefer")},
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# === Login central (Conecta ID) ============================================
# A senha deixa de morar neste banco e passa a ser verificada no Conecta ID
# (serviço interno na prod.solucoes, sem porta pública). O que a pessoa é aqui
# dentro — is_staff, chaves de API, clientes que criou — continua daqui. A
# costura é o `VinculoIdentidade` (apps/crm/models/identidade.py).
#
# AUTH_CENTRAL_ATIVO é a chave que reverte tudo: com ela desligada o
# BackendIdentidade sai da frente e o login volta a ser o local, sem migration e
# sem deploy de emergência. Padrão FALSE de propósito — virar a chave antes de
# rodar `vincular_identidades` deixaria todo mundo do lado de fora.
AUTH_CENTRAL_ATIVO = os.environ.get("AUTH_CENTRAL_ATIVO", "False").strip().lower() in (
    "true",
    "1",
    "yes",
)
# Nome do serviço na rede docker `identidade-net`, não um host público.
IDENTIDADE_URL = os.environ.get("IDENTIDADE_URL", "http://identidade-api:8000")
IDENTIDADE_APP_KEY = os.environ.get("IDENTIDADE_APP_KEY", "")
IDENTIDADE_TIMEOUT = int(os.environ.get("IDENTIDADE_TIMEOUT", "5"))
IDENTIDADE_RESOLVER_USUARIO = "apps.crm.models.resolver_usuario"

# O backend central fica ANTES do ModelBackend. Com a chave desligada ele
# devolve None de imediato e nada muda; com ela ligada, o ModelBackend continua
# atendendo o superusuário do /admin/ e as contas que ainda não têm identidade.
# Ele sai de cena no expurgo, quando as senhas locais forem removidas.
# Um backend so. O `ModelBackend` saiu em 04/08/2026, junto com as senhas
# locais, e a ausencia dele e a parte que importa: enquanto ele estava na lista,
# qualquer caminho que chamasse `authenticate()` com um username — o formulario
# do /admin/, por exemplo — passava por fora do Conecta ID sem que nada no
# codigo de login parecesse errado.
#
# Consequencia pratica: o /admin/ agora exige o E-MAIL no campo "Usuario".
AUTHENTICATION_BACKENDS = [
    "identidade_client.BackendIdentidade",
]

# === i18n ===
LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_TZ = True

# === Static (WhiteNoise) ===
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# Em produção usa o storage com manifest+compressão (exige collectstatic);
# em dev usa o padrão (não depende de manifest).
_staticfiles_backend = (
    "django.contrib.staticfiles.storage.StaticFilesStorage"
    if DEBUG
    else "whitenoise.storage.CompressedManifestStaticFilesStorage"
)
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": _staticfiles_backend},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# === Segurança em produção (quando DEBUG=false) ===
CSRF_TRUSTED_ORIGINS = _env_list("CSRF_TRUSTED_ORIGINS", "")
if _render_host:
    CSRF_TRUSTED_ORIGINS.append(f"https://{_render_host}")

if not DEBUG:
    # Render/Cloudflare terminam o TLS e encaminham este header.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = _env_bool("SECURE_SSL_REDIRECT", True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_CONTENT_TYPE_NOSNIFF = True

# === DRF + JWT (espelha config do ConectaAP) ===
# Taxa aplicada por chave de API (formato do DRF). Sessões JWT do front não são
# limitadas — ver apps/crm/throttling.py.
CRM_API_RATE = os.environ.get("CRM_API_RATE", "120/min")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        # JWT primeiro (front); a chave de API só reivindica o request quando
        # o header traz "Api-Key" ou X-API-Key.
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "apps.crm.authentication.ApiKeyAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_RENDERER_CLASSES": (
        "rest_framework.renderers.JSONRenderer",
    ),
    "DEFAULT_THROTTLE_CLASSES": (
        "apps.crm.throttling.ApiKeyRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "api_key": CRM_API_RATE,
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=240),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# === CORS ===
CORS_ALLOWED_ORIGINS = _env_list(
    "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
)
CORS_ALLOW_CREDENTIALS = True

# === Regras de negócio do CRM ===
# Taxa de comissão recorrente (fração). 0.03 = 3%.
CRM_COMISSAO_RATE = float(os.environ.get("CRM_COMISSAO_RATE", "0.03"))
# Duração padrão do contrato (meses) usada quando o cliente não informa.
CRM_MESES_CONTRATO_PADRAO = int(os.environ.get("CRM_MESES_CONTRATO_PADRAO", "12"))
