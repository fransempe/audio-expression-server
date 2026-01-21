# Audio Expression Measurement

Aplicación Next.js para análisis de emociones en tiempo real mediante voz usando la API de Hume AI.

## Estructura del Proyecto

- **Next.js App**: Frontend en `app/`
- **WebSocket Proxy**: Servidor Node.js en `ws-proxy/` que actúa como proxy entre el cliente y la API de Hume

## Configuración

### 1. Instalar dependencias

```bash
# Instalar dependencias de Next.js
npm install

# Instalar dependencias del proxy WebSocket
cd ws-proxy
npm install
cd ..
```

### 2. Configurar variables de entorno

#### Para el proxy WebSocket (`ws-proxy/.env`):

```env
PORT=8787
HUME_API_KEY=tu_api_key_aqui
HUME_WS_URL=wss://api.hume.ai/v0/stream/models
```

#### Para Next.js (`.env.local`):

```env
NEXT_PUBLIC_WS_PROXY_URL=ws://localhost:8787/ws
```

## Uso

### 1. Iniciar el servidor WebSocket proxy

```bash
cd ws-proxy
npm run dev
```

El servidor estará corriendo en `http://localhost:8787`

### 2. Iniciar la aplicación Next.js

En otra terminal:

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

### 3. Usar la aplicación

1. Abre `http://localhost:3000` en tu navegador
2. Haz clic en "Start" para comenzar la grabación
3. Permite el acceso al micrófono cuando se solicite
4. Habla al micrófono y verás las emociones detectadas en tiempo real
5. Haz clic en "Stop" para detener la grabación

## Notas

- El servidor WebSocket proxy debe estar corriendo antes de usar la aplicación Next.js
- En producción, considera alojar el proxy WebSocket en un servidor Node.js dedicado (no en Vercel, ya que no soporta WebSockets persistentes)
- Asegúrate de tener una API key válida de Hume AI

