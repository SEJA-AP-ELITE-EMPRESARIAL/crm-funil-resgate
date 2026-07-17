# Backend Django do CRM — imagem de produção (gunicorn).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_DEBUG=false

WORKDIR /app

# Dependências (psycopg[binary] traz wheel, sem toolchain nativo)
COPY requirements.txt requirements-prod.txt ./
RUN pip install --no-cache-dir -r requirements-prod.txt

COPY . .

# Estáticos do admin (gera o manifest do WhiteNoise; não toca no banco)
RUN python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "120"]
