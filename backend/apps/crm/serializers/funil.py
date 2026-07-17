from rest_framework import serializers

from apps.crm.models import Funil


class FunilSerializer(serializers.ModelSerializer):
    class Meta:
        model = Funil
        fields = ["id", "nome", "slug", "cor", "descricao", "ativo", "ordem"]
        read_only_fields = fields
