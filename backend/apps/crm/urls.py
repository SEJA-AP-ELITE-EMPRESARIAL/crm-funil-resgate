from django.urls import path

from apps.crm.views import auth_views, cliente_views, funil_views, import_views

app_name = "crm"

urlpatterns = [
    # Sessão / config
    path("me/", auth_views.me, name="me"),
    path("config/", auth_views.config, name="config"),
    # Funis
    path("funis/", funil_views.funil_list, name="funil_list"),
    # Clientes (CRUD)
    path("clientes/", cliente_views.cliente_root, name="cliente_root"),
    path("clientes/importar/", import_views.importar, name="cliente_importar"),
    path("clientes/modelo-importacao/", import_views.modelo_importacao, name="cliente_modelo"),
    path("clientes/<int:cliente_id>/", cliente_views.cliente_item, name="cliente_item"),
]
