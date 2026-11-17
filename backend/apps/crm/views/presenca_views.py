"""
POST /api/crm/presenca/ — "esta pessoa está nesta tela agora" (TSK-1521).

O Conecta tem o painel "Uso em tempo real" (só SuperAdmin): quem está online
agora em cada sistema, e em qual tela. A tela do CRM (`SinalDePresenca`, no
`App.jsx`) chama esta rota uma vez por minuto com a aba aberta, na hora quando a
pessoa troca de tela e na volta à aba; a rota repassa ao Conecta pelo
`identidade_client.enviar_presenca` (cliente 1.6.0), com a AppKey do CRM
(`IDENTIDADE_APP_KEY`, a mesma do login). Regras decididas pelo Mathias em
16/11/2026: online = sinal nos últimos 2 min; parado = sem interação há mais
de 3 min. Quem decide as duas coisas é o Conecta: daqui sai só o sinal.

- **Só o JWT da tela.** A autenticação da rota é só o `JWTRevalidado`: a chave
  de API (integração, n8n) nem é lida, e a sessão do `/admin/` do Django também
  não. Sem o JWT, 401, e nada vai ao Conecta: uma integração lendo o funil
  apareceria como a pessoa dona da chave online.
- **204 sempre que o corpo vale**, com o Conecta fora, lento ou em manutenção:
  `enviar_presenca` nunca levanta, tem timeout de 2 s e pausa o processo depois
  de uma falha. O sinal é acessório, e a tela não faz nada com a resposta.
- **400** para o corpo que não tem a forma abaixo.
- **Limite por pessoa** (`CRM_PRESENCA_RATE`, 20/min): a tela manda um por
  minuto por aba, mais um por troca de tela e um por volta à aba (no máximo a
  cada 30 s). O CRM não configura `CACHES`, então o contador é o LocMem de cada
  worker do gunicorn: com 3 workers, o teto real chega a 3 vezes isso.
- **Nada fica aqui:** sem model, sem migration, sem cache do sinal, sem log por
  sinal. O Conecta guarda só o estado de agora (decisão de 16/11/2026).

Corpo (JSON):

- `tela`: texto, obrigatório (ex.: "Funil Resgate · Cliente");
- `modulo`: texto, opcional (ex.: "Kanban");
- `ultima_interacao`: opcional; ISO 8601 COM o fuso (o `toISOString()` do
  navegador), até 64 caracteres, como no Conecta. Sem fuso não se sabe que
  hora é, e o Conecta recusaria.

Os dois textos vão até `TAMANHO_DO_TEXTO_NO_SINAL` (500) do cliente, que é o
que o Conecta aceita; quem os corta em 60 e 120, com reticências, é ele. A tela
já os manda curtos. Coberto em `apps/crm/tests/test_presenca.py`.
"""
from django.conf import settings
from django.utils.dateparse import parse_datetime
from rest_framework import serializers, status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

import identidade_client
from apps.crm.authentication import JWTRevalidado

TAMANHO_MAXIMO = identidade_client.TAMANHO_DO_TEXTO_NO_SINAL


class LimiteDaPresenca(UserRateThrottle):
    # A autenticação vem antes da cota no DRF: só quem tem o JWT consome a dele.
    scope = "presenca"

    def get_rate(self):
        return settings.CRM_PRESENCA_RATE


class SinalDePresencaSerializer(serializers.Serializer):
    tela = serializers.CharField(max_length=TAMANHO_MAXIMO)
    modulo = serializers.CharField(
        max_length=TAMANHO_MAXIMO, required=False, allow_blank=True, default=""
    )
    ultima_interacao = serializers.CharField(
        max_length=64, required=False, allow_null=True, default=None
    )

    def validate_ultima_interacao(self, valor):
        if valor is None:
            return None
        try:
            quando = parse_datetime(valor)
        except (ValueError, OverflowError):
            # Bem formada, mas impossível (mês 13, fuso de 25 horas).
            quando = None
        if quando is None or quando.tzinfo is None:
            raise serializers.ValidationError("A última interação vai em ISO 8601, com o fuso.")
        return quando


@api_view(["POST"])
@authentication_classes([JWTRevalidado])
@permission_classes([IsAuthenticated])
@throttle_classes([LimiteDaPresenca])
def presenca(request):
    sinal = SinalDePresencaSerializer(data=request.data)
    sinal.is_valid(raise_exception=True)
    dados = sinal.validated_data
    # Devolve True/False e nunca levanta: o resultado não muda a resposta.
    identidade_client.enviar_presenca(
        request.user,
        modulo=dados["modulo"],
        tela=dados["tela"],
        ultima_interacao=dados["ultima_interacao"],
    )
    return Response(status=status.HTTP_204_NO_CONTENT)
