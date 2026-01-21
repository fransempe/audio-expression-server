# WebSocket Proxy Server

Servidor proxy que conecta el cliente Next.js con la API de Hume AI.

## Configuración

Crea un archivo `.env` en este directorio con las siguientes variables:

```env
PORT=8787
HUME_API_KEY=tu_api_key_aqui
HUME_WS_URL=wss://api.hume.ai/v0/stream/models
```

## Uso

```bash
npm run dev
```

El servidor estará disponible en `http://localhost:8787` y el endpoint WebSocket en `ws://localhost:8787/ws`

