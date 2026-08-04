from django.urls import path

from apps.crm.views import auth_views, cliente_views, etapa_views, funil_views, import_views

app_name = "crm"

urlpatterns = [
    # Sessão / config
    path("me/", auth_views.me, name="me"),
    path("config/", auth_views.config, name="config"),
    # Senha (só no modo central — ver apps/crm/identidade_senha.py)
    path("senha/", auth_views.trocar_senha, name="trocar_senha"),
    path("senha/definir/", auth_views.definir_senha, name="definir_senha"),
    # Funis
    path("funis/", funil_views.funil_list, name="funil_list"),
    # Etapas (colunas do Kanban)
    path("etapas/", etapa_views.etapa_root, name="etapa_root"),
    path("etapas/reordenar/", etapa_views.etapa_reordenar, name="etapa_reordenar"),
    path("etapas/<int:etapa_id>/", etapa_views.etapa_item, name="etapa_item"),
    # Clientes (CRUD)
    path("clientes/", cliente_views.cliente_root, name="cliente_root"),
    path("clientes/importar/", import_views.importar, name="cliente_importar"),
    path("clientes/modelo-importacao/", import_views.modelo_importacao, name="cliente_modelo"),
    path("clientes/<int:cliente_id>/", cliente_views.cliente_item, name="cliente_item"),
]
