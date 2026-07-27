"""
Rate limiting das chaves de API.

Limita por chave (não por IP): cada integração tem sua própria cota. Sessões JWT
do front não são limitadas — get_cache_key devolve None e o DRF ignora.

Taxa configurável em `CRM_API_RATE` (formato do DRF, ex.: "120/min").
"""
from rest_framework.throttling import SimpleRateThrottle

from apps.crm.models import ApiKey


class ApiKeyRateThrottle(SimpleRateThrottle):
    scope = "api_key"

    def get_cache_key(self, request, view):
        api_key = getattr(request, "auth", None)
        if not isinstance(api_key, ApiKey):
            return None
        return self.cache_format % {"scope": self.scope, "ident": api_key.prefixo}
