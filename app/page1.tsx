"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_INTERVAL = 5000; // calm
const MIN_DISPLAY_MS = 3000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Page1() {
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const lastUpdateTimeRef = useRef(0);

  const [answer, setAnswer] = useState("Point the camera at a question.");
  const [isRunning, setIsRunning] = useState(false);
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
    abortRef.current?.abort();
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

  // ---------------- APPLY ----------------
  function applyAnswer(text: string) {
    const now = Date.now();
    if (now - lastUpdateTimeRef.current < MIN_DISPLAY_MS) return;

    lastUpdateTimeRef.current = now;
    setAnswer(text);

    if (speak && "speechSynthesis" in window) {
      speechSynthesis.cancel();
      speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
  }

  // ---------------- ANALYZE (LATEST ONLY) ----------------
  async function analyzeOnce() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const requestId = ++requestIdRef.current;

    try {
      const img = captureFrame();
      if (!img) return;

      const res = await fetch("/api/routes1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: img }),
        signal: controller.signal,
      });

      if (!res.ok) return;

      const data = await res.json();
      if (requestId !== requestIdRef.current) return;

      if (data?.answer) applyAnswer(data.answer);
    } catch (e: any) {
      if (e.name !== "AbortError") setError(e.message);
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
      setAnswer("Reading question…");
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
    setAnswer("Stopped.");
  }

  // ---------------- UI (SAME CLASSES) ----------------
  return (
    <main className="container">
      <header className="header">
        <h1>Vision Question Solver</h1>
        <p className="sub">Camera → read → answer</p>

        {/* TOP SWITCH */}
        <button className="btn" onClick={() => router.push("/")}>
          Switch to Scene Narrator
        </button>
      </header>

      <section className="card">
        <div className="videoWrap">
          <video ref={videoRef} className="video" muted playsInline />
        </div>

        <canvas ref={canvasRef} className="hidden" />

        <div className="caption">
          <div className="captionLabel">Answer</div>
          <div className="captionText">{answer}</div>
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
            Speak answers
          </label>
        </div>
      </section>
    </main>
  );
}
