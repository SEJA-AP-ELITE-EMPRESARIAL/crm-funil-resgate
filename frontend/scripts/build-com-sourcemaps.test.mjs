/**
 * build-com-sourcemaps.test.mjs — o passo de build do frontend/Dockerfile (TSK-1147).
 *
 * Roda `scripts/build-com-sourcemaps.sh` de verdade, num `sh`, com `npm`, `wget`,
 * `uname`, `timeout`, `find` e `node` de mentira no PATH, e o "sentry-cli" baixado
 * sendo um script que anota o que recebeu. Cobra o contrato:
 * - sem token ou sem release: build sem mapas, com aviso, sem baixar nada;
 * - com os dois: sha256 conferido, inject, envio e confirmação no servidor, e só
 *   então "enviados";
 * - falha de download, de sha256, de envio ou de confirmação só avisa;
 * - nenhum .map sobra, e o build quebra se sobrar;
 * - o token não aparece na saída nem vira ARG/ENV no Dockerfile.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(RAIZ, "scripts/build-com-sourcemaps.sh");
const TOKEN = "token-secreto-de-teste-123";

// O "sentry-cli": anota os argumentos, o projeto e se recebeu o token.
const CLI_FALSO = `#!/bin/sh
echo "cli $* projeto=$SENTRY_PROJECT org=$SENTRY_ORG url=$SENTRY_URL token=\${SENTRY_AUTH_TOKEN:+sim}" >> "$REGISTRO"
case "$1 $2" in
  "sourcemaps inject") [ "$FALHA" = inject ] && exit 1; for f in dist/assets/*.js; do echo "//# debugId=x" >> "$f"; done ;;
  "sourcemaps upload") [ "$FALHA" = upload ] && exit 1 ;;
esac
exit 0
`;

const STUBS = {
  // O build do Vite: um .js sempre, e o .map só com SOURCEMAPS_OCULTOS.
  npm: `#!/bin/sh
echo "npm $* ocultos=\${SOURCEMAPS_OCULTOS:-nao}" >> "$REGISTRO"
mkdir -p dist/assets
echo "console.log(1)" > dist/assets/index.js
if [ "$SOURCEMAPS_OCULTOS" = true ] || [ "$SOBRA_MAP" = sim ]; then echo "{}" > dist/assets/index.js.map; fi
exit 0
`,
  // Anota o prazo e roda o comando, para o teste cobrar que a rede tem prazo.
  timeout: `#!/bin/sh
echo "timeout $1 $(basename "$2")" >> "$REGISTRO"
shift
exec "$@"
`,
  // Com SOBRA_MAP, o \`-delete\` "falha calado" e deixa o .map: só a guarda pega.
  find: `#!/bin/sh
for arg in "$@"; do [ "$arg" = -delete ] && [ "$SOBRA_MAP" = sim ] && exit 0; done
PATH="$PATH_ORIGINAL" exec find "$@"
`,
  wget: `#!/bin/sh
echo "wget $*" >> "$REGISTRO"
[ "$FALHA" = download ] && exit 1
while [ $# -gt 0 ]; do [ "$1" = -O ] && saida="$2"; shift; done
cp "$CLI_FALSO" "$saida"
`,
  uname: `#!/bin/sh
echo "\${ARQUITETURA:-x86_64}"
`,
  node: `#!/bin/sh
echo "node $* token=\${SENTRY_AUTH_TOKEN:+sim}" >> "$REGISTRO"
[ "$FALHA" = confirmar ] && { echo "AVISO: não deu para confirmar"; exit 1; }
echo "GlitchTip: o servidor confirmou 1 de 1 arquivo(s)."
`,
};

let base;
let trabalho;
let registro;
let shaDoCli;

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), "build-sourcemaps-"));
  trabalho = path.join(base, "app");
  const stubs = path.join(base, "stubs");
  await mkdir(trabalho);
  await mkdir(stubs);
  await mkdir(path.join(base, "tmp"));
  for (const [nome, conteudo] of Object.entries(STUBS)) {
    await writeFile(path.join(stubs, nome), conteudo);
    await chmod(path.join(stubs, nome), 0o755);
  }
  await writeFile(path.join(base, "cli-falso"), CLI_FALSO);
  await writeFile(path.join(base, "token"), `${TOKEN}\n`);
  registro = path.join(base, "registro");
  await writeFile(registro, "");
  shaDoCli = createHash("sha256").update(CLI_FALSO).digest("hex");
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

function rodar(ambiente = {}) {
  const resultado = spawnSync("sh", [SCRIPT], {
    cwd: trabalho,
    encoding: "utf8",
    env: {
      PATH: `${path.join(base, "stubs")}:${process.env.PATH}`,
      TMPDIR: path.join(base, "tmp"),
      PATH_ORIGINAL: process.env.PATH,
      REGISTRO: registro,
      CLI_FALSO: path.join(base, "cli-falso"),
      GLITCHTIP_TOKEN_ARQUIVO: path.join(base, "token"),
      VITE_SENTRY_RELEASE: "abc1234",
      GLITCHTIP_URL: "https://erros.exemplo",
      GLITCHTIP_ORG: "seja-ap",
      GLITCHTIP_PROJETO: "crm",
      SENTRY_CLI_VERSAO: "3.8.0",
      SENTRY_CLI_SHA256: shaDoCli,
      ...ambiente,
    },
  });
  return { ...resultado, saida: resultado.stdout + resultado.stderr };
}

const linhas = async () => (await readFile(registro, "utf8")).trim().split("\n").filter(Boolean);
const mapsQueSobraram = () =>
  readdirSync(path.join(trabalho, "dist/assets"), { recursive: true }).filter((nome) => nome.endsWith(".map"));

describe("build-com-sourcemaps.sh", () => {
  it("com token e release: inject, envio e confirmação, e só então 'enviados'", async () => {
    const { status, saida } = rodar();

    assert.equal(status, 0, saida);
    assert.ok(saida.includes("GlitchTip: source maps do release abc1234 enviados."), saida);
    assert.ok(!saida.includes("AVISO"), saida);
    const passos = await linhas();
    assert.equal(passos[0], "npm run build ocultos=true");
    assert.ok(passos[1].startsWith("wget -q -T 60 -O "), passos[1]);
    assert.ok(
      passos[1].includes("https://github.com/getsentry/sentry-cli/releases/download/3.8.0/sentry-cli-Linux-x86_64"),
    );
    const contexto = "projeto=crm org=seja-ap url=https://erros.exemplo token=sim";
    assert.deepEqual(passos.slice(2), [
      `cli sourcemaps inject dist/assets ${contexto}`,
      "timeout 120 sentry-cli",
      `cli releases new abc1234 ${contexto}`,
      "timeout 600 sentry-cli",
      `cli sourcemaps upload --release abc1234 --url-prefix ~/assets --strip-prefix ../../ dist/assets ${contexto}`,
      "timeout 600 node",
      "node scripts/confirmar-sourcemaps.mjs abc1234 dist/assets token=sim",
    ]);
    assert.deepEqual(mapsQueSobraram(), []);
    assert.equal(existsSync(path.join(base, "tmp", "sentry-cli")), false);
    assert.ok(!saida.includes(TOKEN));
  });

  for (const [caso, ambiente] of [
    ["sem token", { GLITCHTIP_TOKEN_ARQUIVO: "/nao/existe" }],
    ["com token vazio", { GLITCHTIP_TOKEN_ARQUIVO: "/dev/null" }],
    ["sem release", { VITE_SENTRY_RELEASE: "" }],
  ]) {
    it(`${caso}: build sem mapas, com aviso, sem baixar o CLI`, async () => {
      const { status, saida } = rodar(ambiente);

      assert.equal(status, 0, saida);
      assert.ok(saida.includes("GlitchTip: sem token ou sem release, source maps não gerados nem enviados."));
      assert.deepEqual(await linhas(), ["npm run build ocultos=nao"]);
      assert.deepEqual(mapsQueSobraram(), []);
    });
  }

  for (const [caso, ambiente, aviso] of [
    ["download", { FALHA: "download" }, "AVISO: download do sentry-cli 3.8.0 falhou."],
    ["sha256", { SENTRY_CLI_SHA256: "0".repeat(64) }, "AVISO: o sha256 do sentry-cli baixado não confere."],
    ["arquitetura", { ARQUITETURA: "aarch64" }, "AVISO: sentry-cli só fixado para x86_64 (aqui é aarch64)."],
    ["inject", { FALHA: "inject" }, "AVISO: o sentry-cli não conseguiu injetar os debug IDs."],
    ["envio", { FALHA: "upload" }, "AVISO: o envio dos source maps ao GlitchTip falhou."],
    ["confirmação", { FALHA: "confirmar" }, "AVISO: não deu para confirmar"],
  ]) {
    it(`falha de ${caso} só avisa: o build segue, sem 'enviados' e sem .map`, () => {
      const { status, saida } = rodar(ambiente);

      assert.equal(status, 0, saida);
      assert.ok(saida.includes(aviso), saida);
      assert.ok(
        saida.includes("AVISO: source maps do release abc1234 não confirmados no GlitchTip; o build segue sem eles."),
      );
      assert.ok(!saida.includes("enviados."));
      assert.deepEqual(mapsQueSobraram(), []);
      assert.equal(existsSync(path.join(base, "tmp", "sentry-cli")), false);
    });
  }

  it("sha256 que não confere não deixa o binário rodar", async () => {
    rodar({ SENTRY_CLI_SHA256: "0".repeat(64) });
    assert.equal((await linhas()).some((linha) => linha.startsWith("cli ")), false);
  });

  for (const [caso, ambiente] of [
    ["com token", {}],
    ["sem token", { GLITCHTIP_TOKEN_ARQUIVO: "/nao/existe" }],
  ]) {
    it(`o build quebra se sobrar .map em dist/ (${caso})`, () => {
      const { status, saida } = rodar({ SOBRA_MAP: "sim", ...ambiente });

      assert.equal(status, 1);
      assert.ok(saida.includes("ERRO: sobrou .map em dist/"));
    });
  }
});

describe("frontend/Dockerfile", () => {
  it("roda o script dentro do RUN com o secret, e o token não vira ARG nem ENV", async () => {
    const dockerfile = await readFile(path.join(RAIZ, "Dockerfile"), "utf8");

    assert.ok(dockerfile.includes("RUN --mount=type=secret,id=glitchtip_token sh scripts/build-com-sourcemaps.sh"));
    assert.match(dockerfile, /^ARG GLITCHTIP_PROJETO=crm$/m);
    assert.match(dockerfile, /^ARG SENTRY_CLI_VERSAO=\d+\.\d+\.\d+$/m);
    assert.match(dockerfile, /^ARG SENTRY_CLI_SHA256=[0-9a-f]{64}$/m);
    assert.doesNotMatch(dockerfile, /^(ARG|ENV)\s+\S*(TOKEN|AUTH)/im);
    assert.ok(!dockerfile.includes("glitchtip-cli"));
  });
});

describe("frontend/nginx.conf", () => {
  it("devolve 404 para qualquer .map, antes do proxy do backend", async () => {
    const nginx = await readFile(path.join(RAIZ, "nginx.conf"), "utf8");
    const bloqueio = nginx.indexOf("location ~* \\.map$ {");

    assert.ok(bloqueio > 0);
    assert.match(nginx.slice(bloqueio), /^\s*location ~\* \\\.map\$ \{[^}]*return 404;/);
    assert.ok(bloqueio < nginx.indexOf("location ~ ^/(api|admin|static)/"));
  });
});
