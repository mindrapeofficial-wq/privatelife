# PRIVATE LIFE Android v1

APK Android sincronizada con la instancia web oficial:

https://private-life-04pu.onrender.com/

## Principio de sincronización

La APK no mantiene una copia separada del juego. Usa un WebView Android nativo contra la misma aplicación Next.js y, por tanto, comparte el mismo backend, sesiones y Neon PostgreSQL que la versión web.

## Incluido en v1

- Pantalla completa inmersiva.
- Forzado de la interfaz del teléfono a 100vw x 100dvh sin marco exterior.
- Sesión/cookies persistentes.
- JavaScript, DOM Storage y caché web.
- Selector de imágenes/archivos para chats y galería.
- Navegación Atrás de Android.
- Modo offline con botón de reintento.
- Bloqueo de contenido HTTP inseguro.
- Orientación vertical.
- User-Agent identificable: PrivateLifeAndroid/1.0.

El APK de depuración se genera automáticamente en GitHub Actions como `Private-Life-v1.0.0.apk`.
