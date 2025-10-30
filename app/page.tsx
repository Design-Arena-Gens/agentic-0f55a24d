"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Article = {
  id: string;
  title: string;
  content: string;
  imageUrl: string | null;
  url: string;
  author: string;
  date?: string;
};

const TARGET_DURATION_MS = 4 * 60 * 1000;
const SLIDE_DURATION_MS = 20_000;
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const gradientStops = [
  ["#0ea5e9", "#8b5cf6"],
  ["#22d3ee", "#6366f1"],
  ["#8b5cf6", "#f472b6"],
  ["#0ea5e9", "#14b8a6"]
];

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  let line = "";
  const lines: string[] = [];

  for (const word of words) {
    const testLine = line.length === 0 ? word : `${line} ${word}`;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line.length > 0) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  lines.push(line);

  lines.forEach((ln, idx) => ctx.fillText(ln, x, y + idx * lineHeight));
}

function makeSlides(articles: Article[]) {
  const slides: { article: Article; duration: number; accent: string[] }[] = [];
  if (!articles.length) {
    return slides;
  }

  const accentPool = gradientStops;
  let elapsed = 0;
  let index = 0;

  while (elapsed < TARGET_DURATION_MS) {
    const article = articles[index % articles.length];
    const duration = Math.min(SLIDE_DURATION_MS, TARGET_DURATION_MS - elapsed);
    slides.push({
      article,
      duration,
      accent: accentPool[index % accentPool.length]
    });
    elapsed += duration;
    index += 1;
  }

  return slides;
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>("Idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchNews = async () => {
      try {
        const res = await fetch("/api/news", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Failed to fetch news");
        }
        const data = await res.json();
        if (active) {
          setArticles(data.articles ?? []);
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message ?? "Unexpected error");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchNews();
    return () => {
      active = false;
    };
  }, []);

  const slides = useMemo(() => makeSlides(articles), [articles]);

  const drawSlide = useCallback(
    (ctx: CanvasRenderingContext2D, article: Article, accent: string[]) => {
      const [startColor, endColor] = accent;
      const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      gradient.addColorStop(0, startColor);
      gradient.addColorStop(1, endColor);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
      ctx.fillRect(40, 40, CANVAS_WIDTH - 80, CANVAS_HEIGHT - 80);

      ctx.fillStyle = "#0ea5e9";
      ctx.font = "28px 'Inter', sans-serif";
      ctx.fillText("India Now • Automated Briefing", 80, 110);

      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 48px 'Inter', sans-serif";
      wrapText(ctx, article.title, 80, 180, CANVAS_WIDTH - 160, 60);

      ctx.fillStyle = "rgba(226, 232, 240, 0.8)";
      ctx.font = "28px 'Inter', sans-serif";
      wrapText(
        ctx,
        article.content,
        80,
        380,
        CANVAS_WIDTH - 160,
        44
      );

      ctx.fillStyle = "#38bdf8";
      ctx.font = "24px 'Inter', sans-serif";
      const footerY = CANVAS_HEIGHT - 120;
      ctx.fillText(`Source: ${article.author}`, 80, footerY);
      ctx.fillText(
        new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
        80,
        footerY + 40
      );

      ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
      ctx.font = "20px 'Inter', sans-serif";
      ctx.fillText(article.url, 80, CANVAS_HEIGHT - 40);
    },
    []
  );

  const generateVideo = useCallback(async () => {
    if (!canvasRef.current) {
      setStatus("Canvas unavailable.");
      return;
    }
    if (slides.length === 0) {
      setStatus("No news available yet.");
      return;
    }
    setIsRecording(true);
    setStatus("Preparing recording pipeline…");
    setVideoUrl(null);
    setProgress(0);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setStatus("Unable to obtain drawing context.");
      setIsRecording(false);
      return;
    }

    const stream = canvas.captureStream(30);

    const mimeTypes = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ];
    const selectedMime = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
    if (!selectedMime) {
      setStatus("Browser does not support WebM recording.");
      setIsRecording(false);
      return;
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: selectedMime,
      videoBitsPerSecond: 4_000_000
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: selectedMime });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      if (previewRef.current) {
        previewRef.current.src = url;
        previewRef.current.load();
      }
      setStatus("Video ready — download below and upload to YouTube.");
      setIsRecording(false);
      setProgress(100);
    };

    recorder.start();
    setStatus("Recording slides…");

    let cumulative = 0;

    for (let index = 0; index < slides.length; index += 1) {
      const slide = slides[index];
      drawSlide(ctx, slide.article, slide.accent);
      await wait(slide.duration);
      cumulative += slide.duration;
      setProgress(Math.min(99, Math.round((cumulative / TARGET_DURATION_MS) * 100)));
    }

    setStatus("Finalising video…");
    recorder.stop();
  }, [drawSlide, slides]);

  return (
    <main className="min-h-screen px-6 py-10 md:px-16">
      <section className="mx-auto max-w-6xl space-y-10">
        <header className="space-y-4 text-center">
          <h1 className="text-4xl font-semibold md:text-5xl">
            India Breaking Update • YouTube Video Generator
          </h1>
          <p className="text-lg text-slate-300 md:text-xl">
            Pull the latest national headlines and auto-render a 4 minute HD explainer ready for
            upload.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-[2fr,3fr]">
          <aside className="space-y-6 rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-cyan-500/5">
            <h2 className="text-2xl font-semibold text-cyan-300">Recording Console</h2>
            <p className="text-sm text-slate-400">
              Gathered <span className="font-mono">{articles.length}</span> stories. Each slide
              plays for {SLIDE_DURATION_MS / 1000} seconds to reach the four minute runtime.
            </p>
            <button
              onClick={generateVideo}
              disabled={isRecording || slides.length === 0}
              className="w-full rounded-full bg-cyan-500 px-5 py-3 text-lg font-medium text-slate-900 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {isRecording ? "Generating…" : "Generate 4 Minute Video"}
            </button>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium uppercase tracking-wide text-slate-400">
                <span>Status</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-cyan-400 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-slate-300">{status}</p>
            </div>
            {videoUrl && (
              <div className="space-y-3 rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-4">
                <p className="text-sm text-slate-200">
                  Download the WebM file and upload to your YouTube channel as-is or splice in your
                  own clips.
                </p>
                <a
                  href={videoUrl}
                  download={`india-update-${Date.now()}.webm`}
                  className="inline-flex items-center justify-center rounded-full border border-cyan-400 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400 hover:text-slate-900"
                >
                  Download Video
                </a>
              </div>
            )}
          </aside>

          <section className="space-y-6">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="hidden"
            />
            <video
              ref={previewRef}
              controls
              className="w-full rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl shadow-cyan-500/10"
              poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'%3E%3Crect width='1280' height='720' fill='%230b1120'/%3E%3C/svg%3E"
            />
            <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
              <h2 className="text-2xl font-semibold text-slate-100">Latest Headlines</h2>
              {loading && <p className="text-sm text-cyan-200">Updating India bulletin…</p>}
              {error && <p className="text-sm text-rose-300">{error}</p>}
              {!loading && !error && (
                <ul className="space-y-4">
                  {articles.map((article) => (
                    <li
                      key={article.id}
                      className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 transition hover:border-cyan-500/40"
                    >
                      <a
                        className="text-xl font-semibold text-cyan-200"
                        href={article.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {article.title}
                      </a>
                      <p className="mt-2 text-sm text-slate-300">{article.content}</p>
                      <div className="mt-3 text-xs uppercase tracking-wide text-slate-500">
                        {article.author} •{" "}
                        {article.date
                          ? new Date(article.date).toLocaleString("en-IN", {
                              timeZone: "Asia/Kolkata"
                            })
                          : "Today"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
