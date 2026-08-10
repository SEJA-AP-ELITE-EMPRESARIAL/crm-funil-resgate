# Backend Django do CRM — imagem de produção (gunicorn).
#
# Python 3.14: topo do que o Django 6.1 suporta (3.12 a 3.14). A 3.12 é o piso
# da 6.x, não uma escolha conservadora.
#
# ATENÇÃO ao mexer nesta linha: a imagem não traz compilador nem libpq-dev. Se a
# base subir para uma versão de Python sem wheel binário do psycopg, o pip tenta
# compilar e o BUILD FALHA — não degrada, quebra. Confira antes de trocar.
# Manter em sincronia com .github/workflows/ci.yml.
FROM python:3.14-slim

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
