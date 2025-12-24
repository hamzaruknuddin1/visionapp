"use client";

import { useEffect, useRef, useState } from "react";

type VisionMode = "quick" | "detailed";

const DEFAULT_INTERVAL = 5000;
const MIN_DISPLAY_MS = 5500;
const SIMILARITY_IGNORE = 0.85;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normalizeText(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function similarity(a: string, b: string) {
  const A = new Set(normalizeText(a).split(" ").filter(Boolean));
  const B = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let i = 0;
  A.forEach((w) => B.has(w) && i++);
  return i / (A.size + B.size - i);
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const runningRef = useRef(false);
  const inFlightRef = useRef(false);

  const lastCaptionRef = useRef("");
  const lastUpdateTimeRef = useRef(0);

  const [caption, setCaption] = useState("Tap Start to begin.");
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<VisionMode>("quick");
  const [intervalMs, setIntervalMs] = useState(DEFAULT_INTERVAL);
  const [speak, setSpeak] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => stopCamera(), []);

  // ---------------- CAMERA ----------------
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera not supported");
    }

    let stream: MediaStream | null = null;

    // Force back camera on phones
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: "environment" } },
        audio: false,
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
    }

    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    }

    const video = videoRef.current!;
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");

    await new Promise<void>((r) => (video.onloadedmetadata = () => r()));
    await video.play();
  }

  function stopCamera() {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  // ---------------- FRAME ----------------
  function captureFrame() {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || v.readyState < 2) return null;

    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h) return null;

    const targetW = 640;
    const scale = targetW / w;

    c.width = targetW;
    c.height = h * scale;

    const ctx = c.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.5);
  }

  // ---------------- APPLY LOGIC ----------------
  function applyCaption(newCaption: string) {
    const now = Date.now();

    // ⛔ Minimum display time
    if (now - lastUpdateTimeRef.current < MIN_DISPLAY_MS) return;

    const sim = similarity(newCaption, lastCaptionRef.current);

    // ⛔ Scene effectively unchanged
    if (sim > SIMILARITY_IGNORE) return;

    lastCaptionRef.current = newCaption;
    lastUpdateTimeRef.current = now;
    setCaption(newCaption);

    if (speak && "speechSynthesis" in window) {
      speechSynthesis.cancel();
      speechSynthesis.speak(new SpeechSynthesisUtterance(newCaption));
    }
  }

  // ---------------- ANALYZE ----------------
  async function analyzeOnce() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const img = captureFrame();
      if (!img) return;

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: img, mode }),
      });

      if (!res.ok) throw new Error("Vision API error");

      const { caption } = await res.json();
      if (caption) applyCaption(caption);
    } catch (e: any) {
      setError(e.message);
    } finally {
      inFlightRef.current = false;
    }
  }

  async function loop() {
    while (runningRef.current) {
      await analyzeOnce();
      await sleep(intervalMs);
    }
  }

  async function onStart() {
    try {
      await startCamera();
      runningRef.current = true;
      setIsRunning(true);
      setCaption("Looking…");
      setError(null);
      loop();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function onStop() {
    runningRef.current = false;
    setIsRunning(false);
    stopCamera();
    speechSynthesis?.cancel();
    setCaption("Stopped.");
  }

  // ---------------- UI (UNCHANGED CLASSES) ----------------
  return (
    <main className="container">
      <header className="header">
        <h1>Vision Narrator MVP</h1>
        <p className="sub">Live camera → calm AI narration</p>
      </header>

      <section className="card">
        <div className="videoWrap">
          <video ref={videoRef} className="video" muted playsInline />
        </div>

        <canvas ref={canvasRef} className="hidden" />

        <div className="caption">
          <div className="captionLabel">Live caption</div>
          <div className="captionText">{caption}</div>
          {error && <div className="error">{error}</div>}
        </div>

        <div className="controls">
          {!isRunning ? (
            <button className="btn primary" onClick={onStart}>
              Start
            </button>
          ) : (
            <button className="btn danger" onClick={onStop}>
              Stop
            </button>
          )}

          <div className="row">
            <label className="label">
              Mode
              <select
                className="select"
                value={mode}
                onChange={(e) => setMode(e.target.value as VisionMode)}
              >
                <option value="quick">Quick</option>
                <option value="detailed">Detailed</option>
              </select>
            </label>

           <label className="label">
            Interval
            <select
              className="select"
              value={intervalMs}
              onChange={(e) => setIntervalMs(Number(e.target.value))}
            >
              <option value={5000}>5s (Calm)</option>
              <option value={7000}>7s (Very Calm)</option>
            </select>
          </label>

          </div>

          <label className="toggle">
            <input
              type="checkbox"
              checked={speak}
              onChange={(e) => setSpeak(e.target.checked)}
            />
            Speak captions
          </label>
        </div>
      </section>
    </main>
  );
}
