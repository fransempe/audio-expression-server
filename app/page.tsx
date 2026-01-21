"use client";

import React, { useMemo, useRef, useState } from "react";

type PredictionMsg =
  | { type: "ready" }
  | { type: "predictions"; data: any }
  | { type: "error"; message: string };

type TopItem = { name: string; score: number };

// Diccionario de traducciones de emociones
const emotionTranslations: Record<string, string> = {
  admiration: "Admiración",
  adoration: "Adoración",
  "aesthetic appreciation": "Apreciación estética",
  amusement: "Diversión",
  anger: "Enojo",
  anxiety: "Ansiedad",
  awe: "Asombro",
  awkwardness: "Vergüenza ajena",
  boredom: "Aburrimiento",
  calmness: "Calma",
  concentration: "Concentración",
  confusion: "Confusión",
  contemplation: "Contemplación",
  contempt: "Desprecio",
  contentment: "Satisfacción",
  craving: "Antojo",
  desire: "Deseo",
  determination: "Determinación",
  disappointment: "Decepción",
  disgust: "Disgusto",
  distress: "Angustia",
  doubt: "Duda",
  ecstasy: "Éxtasis",
  elation: "Euforia",
  embarrassment: "Vergüenza",
  empathy: "Empatía",
  entrancement: "Fascinación",
  envy: "Envidia",
  excitement: "Emoción",
  fear: "Miedo",
  gratitude: "Gratitud",
  guilt: "Culpa",
  horror: "Horror",
  interest: "Interés",
  joy: "Alegría",
  love: "Amor",
  nostalgia: "Nostalgia",
  pain: "Dolor",
  pride: "Orgullo",
  realization: "Comprensión",
  relief: "Alivio",
  romance: "Romance",
  sadness: "Tristeza",
  satisfaction: "Satisfacción",
  shame: "Vergüenza",
  surprise: "Sorpresa",
  sympathy: "Simpatía",
  tiredness: "Cansancio",
  triumph: "Triunfo",
};

function getEmotionTranslation(name: string): string {
  return emotionTranslations[name.toLowerCase()] || name;
}

export default function Page() {
  const wsUrl = process.env.NEXT_PUBLIC_WS_PROXY_URL!;
  const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT || ""; // Endpoint configurable
  const wsRef = useRef<WebSocket | null>(null);
  const stopTracksRef = useRef<(() => void) | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);

  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string>("idle");
  const [top, setTop] = useState<TopItem[]>([]);
  // Acumuladores y resúmenes separados para Prosody y Burst
  const [allProsodyPredictions, setAllProsodyPredictions] = useState<
    Array<{ name: string; score: number }>
  >([]);
  const [allBurstPredictions, setAllBurstPredictions] = useState<
    Array<{ name: string; score: number }>
  >([]);
  const [finalProsodySummary, setFinalProsodySummary] = useState<TopItem[]>([]);
  const [finalBurstSummary, setFinalBurstSummary] = useState<TopItem[]>([]);
  // Estados para el envío de datos
  const [sendingData, setSendingData] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [sendError, setSendError] = useState<string>("");

  const models = useMemo(
    () => ({
      prosody: {},
      burst: {},
    }),
    []
  );

  async function start() {
    setStatus("connecting...");
    // Resetear acumuladores al iniciar nueva sesión
    setAllProsodyPredictions([]);
    setAllBurstPredictions([]);
    setFinalProsodySummary([]);
    setFinalBurstSummary([]);
    setTop([]);
    setSendStatus("idle");
    setSendError("");
    sessionStartTimeRef.current = Date.now(); // Guardar timestamp de inicio
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = async () => {
      setConnected(true);
      setStatus("ws open; starting hume...");
      ws.send(JSON.stringify({ type: "start", models }));

      // Inicia mic + recorder
      const stopMic = await startMicFileChunks((b64) => {
        ws.send(JSON.stringify({ type: "audio", b64 }));
      }, 3000);

      stopTracksRef.current = stopMic;
      setRunning(true);
      setStatus("running");
    };

    ws.onmessage = (evt) => {
      const msg = safeParse(evt.data) as PredictionMsg;
      if (!msg) return;

      if (msg.type === "ready") return;

      if (msg.type === "error") {
        setStatus(`error: ${msg.message}`);
        return;
      }

      if (msg.type === "predictions") {
        // Prosody (emociones continuas en la voz)
        const prosodyItems = extractTopEmotions(msg.data);
        if (prosodyItems.length) {
          setTop(prosodyItems); // seguimos mostrando en vivo el top de Prosody
          setAllProsodyPredictions((prev) => [...prev, ...prosodyItems]);
        }

        // Burst (vocal bursts, si Hume los detecta)
        const burstItems = extractBurstEmotions(msg.data);
        if (burstItems.length) {
          setAllBurstPredictions((prev) => [...prev, ...burstItems]);
        }

        // Extra: info de burst en bruto (no usada en UI por ahora)
        const burstWarning = msg.data?.burst?.warning; // "No vocal bursts detected."
        const burstPreds = msg.data?.burst?.predictions; // (si existe en otros casos)
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setRunning(false);
      setStatus("closed");
      cleanupMic();
    };

    ws.onerror = () => {
      setStatus("ws error");
    };
  }

  function buildSessionData(
    prosodySummary: TopItem[],
    burstSummary: TopItem[],
    prosodyPredictions: Array<{ name: string; score: number }>,
    burstPredictions: Array<{ name: string; score: number }>
  ) {
    const sessionDuration = sessionStartTimeRef.current 
      ? Date.now() - sessionStartTimeRef.current 
      : 0;

    return {
      timestamp: new Date().toISOString(),
      sessionDuration: sessionDuration, // en milisegundos
      prosody: {
        totalPredictions: prosodyPredictions.length,
        summary: prosodySummary.map((item) => ({
          name: item.name,
          nameTranslated: getEmotionTranslation(item.name),
          averageScore: item.score,
        })),
        allPredictions: prosodyPredictions,
      },
      burst: {
        totalPredictions: burstPredictions.length,
        summary: burstSummary.map((item) => ({
          name: item.name,
          nameTranslated: getEmotionTranslation(item.name),
          averageScore: item.score,
        })),
        allPredictions: burstPredictions,
      },
    };
  }

  async function sendSessionData(data: ReturnType<typeof buildSessionData>) {
    if (!apiEndpoint) {
      console.warn("NEXT_PUBLIC_API_ENDPOINT no configurado. Datos no enviados.");
      // Mostrar JSON en consola aunque no haya endpoint configurado
      console.log("📤 JSON que se enviaría:", JSON.stringify(data, null, 2));
      return;
    }

    setSendingData(true);
    setSendStatus("sending");
    setSendError("");

    // Mostrar el JSON en consola antes de enviarlo
    console.log("📤 Enviando datos a:", apiEndpoint);
    console.log("📦 JSON enviado:", JSON.stringify(data, null, 2));

    try {
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setSendStatus("success");
      // Resetear el estado de éxito después de 3 segundos
      setTimeout(() => {
        setSendStatus("idle");
      }, 3000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      setSendStatus("error");
      setSendError(errorMessage);
      console.error("Error enviando datos:", error);
    } finally {
      setSendingData(false);
    }
  }

  async function stop() {
    setStatus("stopping...");
    try {
      wsRef.current?.send(JSON.stringify({ type: "stop" }));
    } catch {}
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;

    cleanupMic();
    setRunning(false);
    
    // Calcular promedios y generar resumen final separados
    const prosodySummary = calculateEmotionAverages(allProsodyPredictions);
    const burstSummary = calculateEmotionAverages(allBurstPredictions);
    setFinalProsodySummary(prosodySummary);
    setFinalBurstSummary(burstSummary);
    
    // Construir y enviar datos al endpoint
    const sessionData = buildSessionData(
      prosodySummary,
      burstSummary,
      allProsodyPredictions,
      allBurstPredictions
    );
    
    await sendSessionData(sessionData);
    
    setStatus("idle");
  }

  function cleanupMic() {
    try {
      stopTracksRef.current?.();
    } catch {}
    stopTracksRef.current = null;
  }

  function calculateEmotionAverages(predictions: Array<{ name: string; score: number }>): TopItem[] {
    if (predictions.length === 0) return [];

    // Agrupar emociones por nombre y acumular scores
    const emotionMap = new Map<string, { total: number; count: number }>();

    predictions.forEach((pred) => {
      const existing = emotionMap.get(pred.name);
      if (existing) {
        existing.total += pred.score;
        existing.count += 1;
      } else {
        emotionMap.set(pred.name, { total: pred.score, count: 1 });
      }
    });

    // Calcular promedios y convertir a array
    const averages: TopItem[] = Array.from(emotionMap.entries())
      .map(([name, { total, count }]) => ({
        name,
        score: total / count, // Promedio
      }))
      .sort((a, b) => b.score - a.score) // Ordenar por score descendente
      .slice(0, 10); // Top 10 emociones más frecuentes/promedio más alto

    return averages;
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Hume – Voice Prosody/Burst (Real-time)</h1>

      <div style={{ marginTop: 12 }}>
        <div><b>Status:</b> {status}</div>
        <div><b>WS:</b> {connected ? "connected" : "disconnected"}</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button
          onClick={start}
          disabled={running}
          style={{ padding: "10px 14px", borderRadius: 10, cursor: running ? "not-allowed" : "pointer" }}
        >
          Start
        </button>
        <button
          onClick={stop}
          disabled={!running}
          style={{ padding: "10px 14px", borderRadius: 10, cursor: !running ? "not-allowed" : "pointer" }}
        >
          Stop
        </button>
      </div>

      {/* Indicador de estado de envío de datos */}
      {sendStatus !== "idle" && (
        <div style={{ 
          marginTop: 12, 
          padding: "10px 14px", 
          borderRadius: 8,
          background: sendStatus === "sending" ? "#fff3cd" : sendStatus === "success" ? "#d4edda" : "#f8d7da",
          border: `1px solid ${sendStatus === "sending" ? "#ffc107" : sendStatus === "success" ? "#28a745" : "#dc3545"}`,
          color: sendStatus === "sending" ? "#856404" : sendStatus === "success" ? "#155724" : "#721c24"
        }}>
          {sendStatus === "sending" && (
            <div>
              <b>⏳ Enviando datos...</b>
            </div>
          )}
          {sendStatus === "success" && (
            <div>
              <b>✅ Datos enviados exitosamente</b>
            </div>
          )}
          {sendStatus === "error" && (
            <div>
              <b>❌ Error al enviar datos:</b> {sendError}
              {!apiEndpoint && (
                <div style={{ marginTop: 4, fontSize: "0.9em" }}>
                  Configura NEXT_PUBLIC_API_ENDPOINT en tu archivo .env.local
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 18, fontWeight: 650 }}>Top emotions Prosody (live)</h2>
        {top.length === 0 ? (
          <p style={{ opacity: 0.7 }}>Hablá al micrófono para ver predicciones…</p>
        ) : (
          <ul style={{ paddingLeft: 16 }}>
            {top.map((t) => (
              <li key={t.name} style={{ margin: "8px 0" }}>
                <b>{t.name}</b> <span style={{ opacity: 0.7, fontSize: "0.9em" }}>({getEmotionTranslation(t.name)})</span> — {t.score.toFixed(3)}
                <div style={{ height: 8, background: "#eee", borderRadius: 999, marginTop: 6 }}>
                  <div
                    style={{
                      height: 8,
                      width: `${Math.min(100, t.score * 100)}%`,
                      background: "#111",
                      borderRadius: 999
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(finalProsodySummary.length > 0 || finalBurstSummary.length > 0) && (
        <section style={{ marginTop: 32, padding: "20px", background: "#f5f5f5", borderRadius: 12 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
            📊 Resumen Final - Promedio de Emociones (Prosody & Burst)
          </h2>
          {finalProsodySummary.length > 0 && (
            <>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 8, marginBottom: 8 }}>Prosody (emociones continuas)</h3>
              <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 12 }}>
                Promedio calculado a partir de {allProsodyPredictions.length} predicciones de Prosody
              </p>
              <ul style={{ paddingLeft: 16, marginBottom: 16 }}>
                {finalProsodySummary.map((t, index) => (
                  <li key={t.name} style={{ margin: "12px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ 
                        fontSize: 18, 
                        fontWeight: 600, 
                        minWidth: 24,
                        color: index < 3 ? "#0066cc" : "#333"
                      }}>
                        #{index + 1}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                          <b style={{ fontSize: 16 }}>{t.name}</b>
                          <span style={{ opacity: 0.7, fontSize: "0.9em" }}>({getEmotionTranslation(t.name)})</span>
                          <span style={{ fontSize: 14, fontWeight: 600, marginLeft: "auto" }}>
                            {t.score.toFixed(4)}
                          </span>
                        </div>
                        <div style={{ height: 10, background: "#ddd", borderRadius: 999, marginTop: 6 }}>
                          <div
                            style={{
                              height: 10,
                              width: `${Math.min(100, t.score * 100)}%`,
                              background: index < 3 ? "#0066cc" : "#666",
                              borderRadius: 999,
                              transition: "width 0.3s ease"
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {finalBurstSummary.length > 0 && (
            <>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 8, marginBottom: 8 }}>Burst (vocal bursts)</h3>
              <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 12 }}>
                Promedio calculado a partir de {allBurstPredictions.length} predicciones de Burst
              </p>
              <ul style={{ paddingLeft: 16 }}>
                {finalBurstSummary.map((t, index) => (
                  <li key={t.name} style={{ margin: "12px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ 
                        fontSize: 18, 
                        fontWeight: 600, 
                        minWidth: 24,
                        color: index < 3 ? "#aa3a00" : "#333"
                      }}>
                        #{index + 1}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                          <b style={{ fontSize: 16 }}>{t.name}</b>
                          <span style={{ opacity: 0.7, fontSize: "0.9em" }}>({getEmotionTranslation(t.name)})</span>
                          <span style={{ fontSize: 14, fontWeight: 600, marginLeft: "auto" }}>
                            {t.score.toFixed(4)}
                          </span>
                        </div>
                        <div style={{ height: 10, background: "#ddd", borderRadius: 999, marginTop: 6 }}>
                          <div
                            style={{
                              height: 10,
                              width: `${Math.min(100, t.score * 100)}%`,
                              background: index < 3 ? "#aa3a00" : "#666",
                              borderRadius: 999,
                              transition: "width 0.3s ease"
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <p style={{ marginTop: 28, fontSize: 13, opacity: 0.75 }}>
        Nota: esto corre bien local / en un server Node. En Vercel no conviene alojar WS persistentes.
      </p>
    </main>
  );

  async function startMicFileChunks(
    onChunkB64: (b64: string) => void,
    sliceMs = 3000
  ) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    let stopped = false;

    const recordOnce = async () => {
      if (stopped) return;

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        if (chunks.length) {
          const blob = new Blob(chunks, { type: recorder.mimeType });
          const b64 = await blobToBase64(blob);
          onChunkB64(b64);
        }
        // encadenar próximo slice
        if (!stopped) recordOnce();
      };

      recorder.start();
      setTimeout(() => {
        try { recorder.stop(); } catch {}
      }, sliceMs);
    };

    recordOnce();

    return () => {
      stopped = true;
      stream.getTracks().forEach((t) => t.stop());
    };
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve((dataUrl.split(",")[1] ?? "").trim());
      };
      reader.readAsDataURL(blob);
    });
  }

  function safeParse(s: any) {
    try { return JSON.parse(s); } catch { return null; }
  }
}

/**
 * Extrae "top emociones" del payload de Hume.
 */
function extractTopEmotions(payload: any): { name: string; score: number }[] {
  const emotions =
    payload?.prosody?.predictions?.[0]?.emotions ??
    payload?.prosody?.predictions?.at?.(0)?.emotions ??
    [];

  if (!Array.isArray(emotions)) return [];

  const list = emotions
    .filter((e) => e && typeof e.name === "string" && typeof e.score === "number")
    .map((e) => ({ name: e.name, score: e.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return list;
}

/**
 * Extrae emociones desde el modelo Burst, si están disponibles.
 * La estructura exacta depende de la respuesta de Hume; aquí asumimos
 * un formato similar a Prosody: predictions[0].emotions.
 */
function extractBurstEmotions(payload: any): { name: string; score: number }[] {
  const emotions =
    payload?.burst?.predictions?.[0]?.emotions ??
    payload?.burst?.predictions?.at?.(0)?.emotions ??
    [];

  if (!Array.isArray(emotions)) return [];

  const list = emotions
    .filter((e) => e && typeof e.name === "string" && typeof e.score === "number")
    .map((e) => ({ name: e.name, score: e.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return list;
}

