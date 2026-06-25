# El Oráculo del E-commerce Institute

Una aplicación web interactiva premium diseñada para servir como mentor y consejero estratégico en negocios digitales, comercio electrónico, marketing digital, conversión (CRO), logística omnicanal y arquitecturas tecnológicas de comercio electrónico.

Esta aplicación se integra directamente con la API de Gemini para proporcionar respuestas inteligentes con un rol experto, simulando la consultoría del E-commerce Institute.

## Características Principales

*   **Diseño Premium e Inmersivo:** Desarrollado con Vanilla CSS y animaciones fluidas. Incluye soporte para múltiples temas:
    *   **Oscuro Profundo (Sleek Dark):** Fondo sofisticado para sesiones nocturnas de planificación.
    *   **Claro Elegante (Clean Light):** Diseño limpio y corporativo de alta legibilidad.
    *   **Cyberpunk (E-commerce Neon):** Paleta inspirada en pantallas técnicas y e-commerce moderno.
*   **Integración Directa con Gemini:** Conexión del lado del cliente a la API oficial de Google Gemini (soporta modelos como `gemini-2.5-flash` y `gemini-2.5-pro`).
*   **Gestión del Historial:** Guarda de manera automática las consultas en el almacenamiento local (`localStorage`) de tu navegador, permitiéndote retomar conversaciones pasadas o eliminarlas.
*   **Sugerencias de Consulta Rápidas:** Tarjetas interactivas en la pantalla de bienvenida con temáticas de alto valor en e-commerce (CRO, B2B, Omnicanalidad y Arquitecturas).
*   **Seguridad:** Tu clave de API se almacena localmente de forma cifrada en la memoria del navegador y nunca se transmite a ningún servidor intermediario.
*   **Exportación de Chats:** Permite descargar los chats completos en formato Markdown (.md) para incorporarlos en tus notas o reportes.
*   **Responsivo:** Diseñado Mobile-First, se adapta perfectamente a smartphones, tablets y pantallas de escritorio.

## ¿Cómo Ejecutar el Proyecto?

La aplicación está diseñada para ser completamente estática y autónoma, por lo que no requiere de complejas instalaciones de Node.js o servidores.

### Opción 1: Abrir directamente
1. Haz doble clic en el archivo [index.html](index.html) para abrirlo en tu navegador favorito (Chrome, Safari, Firefox, Edge, etc.).

### Opción 2: Usar un Servidor Local (Recomendado para testing)
Puedes levantar un servidor de desarrollo ligero. Si tienes Node.js instalado, ejecuta en esta carpeta:
```bash
npx serve .
```
O con Python:
```bash
python3 -m http.server 8000
```
Y abre `http://localhost:8000` en tu navegador.

## Configuración del Oráculo

Para comenzar a interactuar con la IA:
1. Haz clic en **Ajustes del Oráculo** en la barra lateral izquierda (o el ícono de engranaje).
2. Pega tu **Gemini API Key**. (Si no tienes una, puedes conseguirla gratis en [Google AI Studio](https://aistudio.google.com/)).
3. Selecciona el modelo que deseas usar (Gemini 2.5 Flash es la opción rápida y recomendada).
4. Opcionalmente, personaliza el **System Prompt** para redefinir el comportamiento o tono del Oráculo.
5. Haz clic en **Guardar Ajustes** ¡y comienza a consultar!
