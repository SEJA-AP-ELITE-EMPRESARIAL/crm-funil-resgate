#!/usr/bin/env bash
# E2E do sinal de presença (TSK-1521): a tela real (Vite), o backend local
# (Django com SQLite descartável) e um Conecta falso no lugar do de verdade.
#
#   frontend/e2e/rodar-presenca.sh            # PYTHON=… para outro interpretador
#
# Sobe os três em 127.0.0.1, roda o `presenca.spec.js` no Chromium do Playwright
# (`npx playwright install chromium` na primeira vez) e derruba tudo ao sair,
# com sucesso ou não. Os prints vão para docs/telas/tsk-1521/. Nada aqui fala
# com produção: ver e2e/apoio/settings_e2e.py.
set -euo pipefail

FRONT="$(cd "$(dirname "$0")/.." && pwd)"
BACK="$(cd "$FRONT/../backend" && pwd)"
PY="${PYTHON:-$BACK/.venv/bin/python}"
PORTA_CONECTA="${PORTA_CONECTA:-41525}"
PORTA_BACK="${PORTA_BACK:-41526}"
PORTA_FRONT="${PORTA_FRONT:-41527}"

TMP="$(mktemp -d)"
PIDS=()
encerrar() {
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  rm -rf "$TMP"
}
trap encerrar EXIT

# A porta tem de estar livre ANTES de subir cada servidor: ocupada (outra obra
# rodando o e2e), o servidor novo morreria logo, mas o curl do `esperar` seria
# respondido pelo da outra, e a rodada seguiria contra a pilha errada.
livre() {  # livre <url> <nome>
  if curl -s -o /dev/null "$1"; then
    echo "$2: a porta de $1 já está ocupada (outra obra rodando o e2e?)." >&2
    exit 1
  fi
}

# esperar <url> <nome> <log> <pid>: até o servidor responder, ou o processo
# que este roteiro subiu morrer.
esperar() {
  for _ in $(seq 1 120); do
    if ! kill -0 "$4" 2>/dev/null; then
      echo "$2 morreu ao subir (porta ocupada?); log:" >&2
      cat "$3" >&2
      return 1
    fi
    curl -s -o /dev/null "$1" && return 0
    sleep 0.5
  done
  echo "$2 não subiu; log:" >&2
  cat "$3" >&2
  return 1
}

export E2E_CONECTA="http://127.0.0.1:$PORTA_CONECTA"
export E2E_BACKEND="http://127.0.0.1:$PORTA_BACK"
export E2E_BANCO="$TMP/db.sqlite3"
export DJANGO_SETTINGS_MODULE=settings_e2e
export PYTHONPATH="$FRONT/e2e/apoio${PYTHONPATH:+:$PYTHONPATH}"

livre "$E2E_CONECTA/_sinais" "Conecta falso"
"$PY" "$FRONT/e2e/apoio/conecta_falso.py" "$PORTA_CONECTA" >"$TMP/conecta.log" 2>&1 &
PIDS+=($!)
esperar "$E2E_CONECTA/_sinais" "Conecta falso" "$TMP/conecta.log" "$!"

# Os funis e os clientes de exemplo (o Indicados APN já vem com colunas).
"$PY" "$BACK/manage.py" migrate --noinput -v 0
"$PY" "$BACK/manage.py" seed_demo --com-exemplos -v 0 >/dev/null
# Sem valor nos exemplos que estão numa coluna de ganho: o cartão deles derruba o
# Kanban (o `ClienteCard` lê `theme.palette.stages`, que saiu do tema em 5d7d087).
# Bug de antes desta obra, registrado no PR da TSK-1521; não é o que se testa aqui.
"$PY" "$BACK/manage.py" shell -c \
  "from apps.crm.models import Cliente; Cliente.objects.filter(etapa__tipo='ganho').update(valor_contrato=None)"
livre "$E2E_BACKEND/api/crm/config/" "Backend"
"$PY" "$BACK/manage.py" runserver "127.0.0.1:$PORTA_BACK" --noreload >"$TMP/backend.log" 2>&1 &
PIDS+=($!)
esperar "$E2E_BACKEND/api/crm/config/" "Backend" "$TMP/backend.log" "$!"

# Sem DSN do GlitchTip: o ambiente vence o .env do Vite.
livre "http://127.0.0.1:$PORTA_FRONT/" "Vite"
VITE_PROXY_TARGET="$E2E_BACKEND" VITE_SENTRY_DSN="" \
  node "$FRONT/node_modules/vite/bin/vite.js" "$FRONT" \
  --host 127.0.0.1 --port "$PORTA_FRONT" --strictPort >"$TMP/vite.log" 2>&1 &
PIDS+=($!)
esperar "http://127.0.0.1:$PORTA_FRONT/" "Vite" "$TMP/vite.log" "$!"

E2E_URL="http://127.0.0.1:$PORTA_FRONT" \
  node "$FRONT/node_modules/@playwright/test/cli.js" test --config "$FRONT/playwright.config.js" "$@"
