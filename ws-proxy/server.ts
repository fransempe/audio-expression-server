import "dotenv/config";

import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8787;
const HUME_API_KEY = process.env.HUME_API_KEY;
const HUME_WS_URL = process.env.HUME_WS_URL;

if (!HUME_API_KEY) {
  console.error("Missing HUME_API_KEY in ws-proxy/.env");
  process.exit(1);
}

if (!HUME_WS_URL) {
  console.error("Missing HUME_WS_URL in ws-proxy/.env");
  process.exit(1);
}

const app = express();
app.get("/health", (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

/**
 * Mensajes cliente -> proxy
 * - { type: "start", models?: {...} }
 * - { type: "audio", b64: "..." }  // chunk de audio base64 (SIN data URL prefix)
 * - { type: "stop" }
 *
 * Mensajes proxy -> cliente
 * - { type: "ready" }
 * - { type: "predictions", data: <raw from Hume> }
 * - { type: "error", message: string }
 */

wss.on("connection", (clientWs) => {
  let humeWs: WebSocket | null = null;
  let started = false;

  // Guardamos models elegidos por el cliente (o default)
  let sessionModels = {
    prosody: {},
    burst: {},
  };

  clientWs.send(JSON.stringify({ type: "ready" }));

  clientWs.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      clientWs.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    if (msg.type === "start" && !started) {
      started = true;

      if (msg.models && typeof msg.models === "object") {
        sessionModels = msg.models;
      }

      humeWs = new WebSocket(HUME_WS_URL, {
        headers: { "X-Hume-Api-Key": HUME_API_KEY },
      });

      humeWs.on("message", (data) => {
        clientWs.send(
          JSON.stringify({ type: "predictions", data: safeJsonParse(data.toString()) })
        );
      });

      humeWs.on("close", () => {
        clientWs.send(JSON.stringify({ type: "error", message: "Hume WS closed" }));
        try { clientWs.close(); } catch {}
      });

      humeWs.on("error", (err) => {
        clientWs.send(JSON.stringify({ type: "error", message: `Hume WS error: ${err.message}` }));
        try { clientWs.close(); } catch {}
      });

      // ✅ NO mandamos nada acá. Mandamos models+data con cada chunk.

      return;
    }

    if (msg.type === "audio") {
      if (!humeWs || humeWs.readyState !== WebSocket.OPEN) return;
      if (!msg.b64 || typeof msg.b64 !== "string") return;

      // ✅ Enviar models+data juntos (como en el ejemplo de Hume)
      const payload = {
        models: sessionModels,
        data: msg.b64,
      };

      humeWs.send(JSON.stringify(payload));
      return;
    }

    if (msg.type === "stop") {
      try { if (humeWs && humeWs.readyState === WebSocket.OPEN) humeWs.close(); } catch {}
      try { clientWs.close(); } catch {}
      return;
    }
  });

  clientWs.on("close", () => {
    try { if (humeWs && humeWs.readyState === WebSocket.OPEN) humeWs.close(); } catch {}
  });
});

server.listen(PORT, () => {
  console.log(`WS proxy running: http://localhost:${PORT}`);
  console.log(`Client WS path: ws://localhost:${PORT}/ws`);
});

function safeJsonParse(s: string) {
  try { return JSON.parse(s); } catch { return s; }
}

