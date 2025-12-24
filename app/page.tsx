"use client";

import { useEffect, useRef, useState } from "react";

type SpeedMode = "calm" | "normal" | "fast";

const SPEED_CONFIG: Record<SpeedMode, number> = {
  calm: 4000,
  normal: 2500,
  fast: 1200,
};

const MIN_DISPLAY_MS = 3000;
const SIMILARITY_IGNORE = 0.85;
const MIN_SPEAK_GAP = 4000;

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
  const lastSpeakTimeRef = useRef(0);

  const [caption, setCaption] = useState("Tap Start to begin.");
  const [fade, setFade] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [speed, setSpeed] = useState<SpeedMode>("normal");
  const [speak, setSpeak] = useState(true);
  const [accessible, setAccessible] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => stopCamera(), []);

  // ---------- CAMERA ----------
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera not supported");
    }

    let stream: MediaStream | null = null;

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

  // ---------- FRAME ----------
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

  // ---------- SPEECH ----------
  function speakCaption(text: string) {
    if (!speak || !("speechSynthesis" in window)) return;
    if (Date.now() - lastSpeakTimeRef.current < MIN_SPEAK_GAP) return;

    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    lastSpeakTimeRef.current = Date.now();
  }

  // ---------- APPLY ----------
  function applyCaption(newCaption: string) {
    const now = Date.now();
    if (now - lastUpdateTimeRef.current < MIN_DISPLAY_MS) return;

    const sim = similarity(newCaption, lastCaptionRef.current);
    setConfidence(Math.round(sim * 100));

    if (sim > SIMILARITY_IGNORE) return;

    lastCaptionRef.current = newCaption;
    lastUpdateTimeRef.current = now;

    setFade(true);
    setTimeout(() => {
      setCaption(newCaption);
      setFade(false);
      if (accessible) speakCaption(newCaption);
    }, 200);
  }

  // ---------- ANALYZE ----------
  async function analyzeOnce() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const img = captureFrame();
      if (!img) return;

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: img }),
      });

      if (!res.ok) throw new Error("Vision error");

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
      await sleep(SPEED_CONFIG[speed]);
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

  return (
    <main className="container">
      <h1>Vision Narrator</h1>

      <div className="videoWrap">
        <video ref={videoRef} className="video" muted playsInline />
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className={`caption ${fade ? "fade" : ""}`}>
        {caption}
      </div>

      <div className="confidence">
        Scene stability: {confidence}%
      </div>

      {error && <div className="error">{error}</div>}

      <div className="controls">
        {!isRunning ? (
          <button onClick={onStart}>Start</button>
        ) : (
          <button onClick={onStop}>Stop</button>
        )}

        <select value={speed} onChange={(e) => setSpeed(e.target.value as SpeedMode)}>
          <option value="calm">Calm</option>
          <option value="normal">Normal</option>
          <option value="fast">Fast</option>
        </select>

        <label>
          <input type="checkbox" checked={accessible} onChange={(e) => setAccessible(e.target.checked)} />
          Accessibility narration
        </label>
      </div>
    </main>
  );
}
