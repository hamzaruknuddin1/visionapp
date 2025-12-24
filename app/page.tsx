"use client";

import { useEffect, useRef, useState } from "react";

type VisionMode = "quick" | "detailed";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normalizeText(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function jaccard(a: string, b: string) {
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
  const lastSpokenRef = useRef("");
  const lastSpeakTimeRef = useRef(0);

  const [caption, setCaption] = useState("Tap Start to begin.");
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<VisionMode>("quick");
  const [intervalMs, setIntervalMs] = useState(900);
  const [speak, setSpeak] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const IGNORE_SIM = 0.82;
  const MIN_SPEAK_GAP = 2200;

  useEffect(() => {
    return () => stopCamera();
  }, []);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera not supported");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });

    const video = videoRef.current!;
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");

    await new Promise<void>((res) => (video.onloadedmetadata = () => res()));
    await video.play();
  }

  function stopCamera() {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;

    const targetW = 640;
    const scale = targetW / w;

    canvas.width = targetW;
    canvas.height = h * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.55);
  }

  function maybeSpeak(text: string) {
    if (!speak || !("speechSynthesis" in window)) return;
    if (Date.now() - lastSpeakTimeRef.current < MIN_SPEAK_GAP) return;
    if (jaccard(text, lastSpokenRef.current) > IGNORE_SIM) return;

    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    lastSpokenRef.current = text;
    lastSpeakTimeRef.current = Date.now();
  }

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

      if (!res.ok) throw new Error("Vision API failed");

      const { caption } = await res.json();
      if (caption && jaccard(caption, lastCaptionRef.current) < IGNORE_SIM) {
        lastCaptionRef.current = caption;
        setCaption(caption);
        maybeSpeak(caption);
      }
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

  return (
    <main className="container">
      <header className="header">
        <h1>Vision Narrator MVP</h1>
        <p className="sub">Live camera → AI narration</p>
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
              <select className="select" value={mode} onChange={(e) => setMode(e.target.value as VisionMode)}>
                <option value="quick">Quick</option>
                <option value="detailed">Detailed</option>
              </select>
            </label>

            <label className="label">
              Interval
              <select className="select" value={intervalMs} onChange={(e) => setIntervalMs(Number(e.target.value))}>
                <option value={600}>0.6s</option>
                <option value={900}>0.9s</option>
                <option value={1300}>1.3s</option>
              </select>
            </label>
          </div>

          <label className="toggle">
            <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} />
            Speak captions
          </label>
        </div>
      </section>
    </main>
  );
}
