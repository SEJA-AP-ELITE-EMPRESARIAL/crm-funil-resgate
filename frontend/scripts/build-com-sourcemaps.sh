#!/bin/sh
# Build do front com os source maps no GlitchTip (TSK-1147, o mesmo passo do
# Conecta na TSK-1136). Quem chama é o frontend/Dockerfile, dentro do RUN com o
# secret de build `glitchtip_token`.
#
# OPCIONAL: só com o token e com o release (VITE_SENTRY_RELEASE). Com os dois, o
# build gera .map ocultos, o sentry-cli oficial (versão e sha256 fixos) injeta os
# debug IDs e manda o artifact bundle, e scripts/confirmar-sourcemaps.mjs pergunta
# ao servidor se montou cada arquivo. "enviados" só aparece depois dessa
# confirmação: o CLI sai com 0 antes de o GlitchTip montar o pacote, e a montagem
# pode falhar calada. Falha no download, no inject, no envio ou na confirmação só
# avisa, para o deploy não depender do GlitchTip.
#
# Nos dois casos nenhum .map sai daqui (o nginx não tem o que servir), e o build
# quebra se sobrar algum. O token só vive no ambiente deste processo: nada dele vai
# para camada, histórico da imagem ou saída.
#
# Ambiente: VITE_SENTRY_RELEASE, GLITCHTIP_URL, GLITCHTIP_ORG, GLITCHTIP_PROJETO,
# SENTRY_CLI_VERSAO e SENTRY_CLI_SHA256 (os ARG do Dockerfile).
set -eu

TOKEN="$(cat "${GLITCHTIP_TOKEN_ARQUIVO:-/run/secrets/glitchtip_token}" 2>/dev/null || true)"
RELEASE="${VITE_SENTRY_RELEASE:-}"
CLI="${TMPDIR:-/tmp}/sentry-cli"

# Devolve 0 só quando o servidor confirmou os arquivos; o motivo da falha ela mesma avisa.
enviar_mapas() {
  if [ "$(uname -m)" != "x86_64" ]; then
    echo "AVISO: sentry-cli só fixado para x86_64 (aqui é $(uname -m))."
    return 1
  fi
  if ! wget -q -T 60 -O "$CLI" \
      "https://github.com/getsentry/sentry-cli/releases/download/${SENTRY_CLI_VERSAO:-}/sentry-cli-Linux-x86_64"; then
    echo "AVISO: download do sentry-cli ${SENTRY_CLI_VERSAO:-} falhou."
    return 1
  fi
  if ! echo "${SENTRY_CLI_SHA256:-}  $CLI" | sha256sum -c - >/dev/null 2>&1; then
    echo "AVISO: o sha256 do sentry-cli baixado não confere."
    return 1
  fi
  chmod +x "$CLI"

  export SENTRY_URL="${GLITCHTIP_URL:-}" SENTRY_ORG="${GLITCHTIP_ORG:-}" SENTRY_PROJECT="${GLITCHTIP_PROJETO:-}"
  export SENTRY_AUTH_TOKEN="$TOKEN"
  if ! "$CLI" sourcemaps inject dist/assets; then
    echo "AVISO: o sentry-cli não conseguiu injetar os debug IDs."
    return 1
  fi
  # Liga o release ao projeto; sem isto o GlitchTip o cria no primeiro evento.
  # Cada chamada à rede tem prazo: um GlitchTip parado não segura o deploy. O inject
  # não usa rede, e um corte no meio dele deixaria um .js truncado.
  timeout 120 "$CLI" releases new "$RELEASE" >/dev/null 2>&1 || true
  # Os mapas do Vite apontam o fonte a partir de dist/assets (../../src/...): com o
  # prefixo tirado, o frame aparece como src/... no GlitchTip.
  if ! timeout 600 "$CLI" sourcemaps upload --release "$RELEASE" --url-prefix '~/assets' --strip-prefix '../../' dist/assets; then
    echo "AVISO: o envio dos source maps ao GlitchTip falhou."
    return 1
  fi
  if ! timeout 600 node scripts/confirmar-sourcemaps.mjs "$RELEASE" dist/assets; then
    echo "AVISO: o GlitchTip não confirmou os arquivos do release."
    return 1
  fi
}

if [ -n "$TOKEN" ] && [ -n "$RELEASE" ]; then
  SOURCEMAPS_OCULTOS=true npm run build
  if enviar_mapas; then
    echo "GlitchTip: source maps do release $RELEASE enviados."
  else
    echo "AVISO: source maps do release $RELEASE não confirmados no GlitchTip; o build segue sem eles."
  fi
  rm -f "$CLI"
else
  echo "GlitchTip: sem token ou sem release, source maps não gerados nem enviados."
  npm run build
fi

find dist -name '*.map' -delete
if [ -n "$(find dist -name '*.map')" ]; then
  echo "ERRO: sobrou .map em dist/"
  exit 1
fi
