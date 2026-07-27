"""
Chave de API para integração externa (n8n, ConectaAP, terceiros).

Por que existe: o JWT do front expira em 4h e depende de refresh — inviável para
automação. A chave é um segredo de vida longa, revogável e com escopo próprio.

Segurança: o banco guarda apenas o SHA-256 da chave completa. O texto puro é
exibido UMA única vez, na criação (admin ou management command). Perdeu, gera
outra — não há como recuperar.

Formato: ``crm_<prefixo>_<segredo>``. O prefixo é indexado e serve só para
localizar o registro; a validação é feita comparando o hash em tempo constante.
"""
import hashlib
import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone

# Tamanho do prefixo (parte pública) e do segredo, em caracteres url-safe.
_TAM_PREFIXO = 8
_TAM_SEGREDO = 32
_ALFABETO = "abcdefghijklmnopqrstuvwxyz0123456789"

# Só grava `ultimo_uso_em` se o registro anterior tiver mais que isto (segundos).
# Evita um UPDATE por requisição em integrações de alto volume.
_INTERVALO_REGISTRO_USO = 60


class EscopoApiKey(models.TextChoices):
    LEITURA = "leitura", "Somente leitura"
    ESCRITA = "escrita", "Leitura e escrita"


class ApiKey(models.Model):
    nome = models.CharField(
        max_length=80,
        help_text="Para quem é a chave (ex.: 'n8n — sincronização diária').",
    )
    prefixo = models.CharField(max_length=_TAM_PREFIXO, unique=True, db_index=True, editable=False)
    hash_chave = models.CharField(max_length=64, editable=False)

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="api_keys",
        help_text=(
            "Usuário em nome de quem a chave age — é ele que aparece em "
            "`criado_por` nos registros criados pela integração."
        ),
    )
    escopo = models.CharField(max_length=10, choices=EscopoApiKey.choices, default=EscopoApiKey.LEITURA)

    ativa = models.BooleanField(default=True, help_text="Desmarque para revogar imediatamente.")
    expira_em = models.DateTimeField(null=True, blank=True, help_text="Opcional. Vazio = não expira.")
    ultimo_uso_em = models.DateTimeField(null=True, blank=True, editable=False)

    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="api_keys_criadas",
        editable=False,
    )
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "chave de API"
        verbose_name_plural = "chaves de API"
        ordering = ("-criado_em",)

    def __str__(self) -> str:
        return f"{self.nome} ({self.prefixo}…)"

    # === geração / validação ===

    @staticmethod
    def calcular_hash(chave: str) -> str:
        return hashlib.sha256(chave.encode("utf-8")).hexdigest()

    def definir_nova_chave(self) -> str:
        """Sorteia prefixo + segredo, grava o hash e devolve a chave em texto puro.

        Não salva — quem chamar decide quando persistir.
        """
        prefixo = "".join(secrets.choice(_ALFABETO) for _ in range(_TAM_PREFIXO))
        segredo = secrets.token_urlsafe(_TAM_SEGREDO)
        chave = f"crm_{prefixo}_{segredo}"
        self.prefixo = prefixo
        self.hash_chave = self.calcular_hash(chave)
        return chave

    @classmethod
    def gerar(cls, nome: str, usuario, escopo: str = EscopoApiKey.LEITURA, **extra) -> tuple["ApiKey", str]:
        """Cria e salva a chave. Devolve `(instancia, chave_em_texto_puro)`."""
        api_key = cls(nome=nome, usuario=usuario, escopo=escopo, **extra)
        chave = api_key.definir_nova_chave()
        api_key.save()
        return api_key, chave

    @staticmethod
    def extrair_prefixo(chave: str) -> str | None:
        """`crm_<prefixo>_<segredo>` → prefixo, ou None se o formato não bater."""
        partes = chave.split("_", 2)
        if len(partes) != 3 or partes[0] != "crm" or len(partes[1]) != _TAM_PREFIXO:
            return None
        return partes[1]

    def confere(self, chave: str) -> bool:
        return secrets.compare_digest(self.hash_chave, self.calcular_hash(chave))

    @property
    def expirada(self) -> bool:
        return bool(self.expira_em and self.expira_em <= timezone.now())

    def registrar_uso(self) -> None:
        """Atualiza `ultimo_uso_em` no máximo uma vez por minuto (UPDATE direto)."""
        agora = timezone.now()
        if self.ultimo_uso_em and (agora - self.ultimo_uso_em).total_seconds() < _INTERVALO_REGISTRO_USO:
            return
        type(self).objects.filter(pk=self.pk).update(ultimo_uso_em=agora)
        self.ultimo_uso_em = agora
