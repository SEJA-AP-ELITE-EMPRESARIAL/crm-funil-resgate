"""
URLconf raiz do CRM Funil de Resgate.

Padrão do ConectaAP: JWT no raiz (/api/token/...) e cada app incluído com
namespace (path('api/crm/', include('apps.crm.urls', namespace='crm'))).
"""
from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import (
    TokenRefreshView,
    TokenVerifyView,
)

from apps.crm.views.auth_views import CustomTokenObtainPairView

urlpatterns = [
    path("admin/", admin.site.urls),
    # Autenticação JWT (login por e-mail ou username)
    path("api/token/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/token/verify/", TokenVerifyView.as_view(), name="token_verify"),
    # App CRM
    path("api/crm/", include("apps.crm.urls", namespace="crm")),
]
