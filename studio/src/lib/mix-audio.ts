export type MixInputs = {
  videoUrl: string;
  originalGain: number;
  musicBuffer?: AudioBuffer;
  musicGain: number;
  narrationBuffer?: AudioBuffer;
  narrationGain: number;
  durationHint?: number;
};

type Stash = { blob: Blob; url: string };

const MIXES = new Map<string, Stash>();

export function stashMix(id: string, blob: Blob): string {
  const prev = MIXES.get(id);
  if (prev) URL.revokeObjectURL(prev.url);
  const url = URL.createObjectURL(blob);
  MIXES.set(id, { blob, url });
  return url;
}

export function getStashedMix(id: string): Stash | undefined {
  return MIXES.get(id);
}

export function duckMusic(hasNarration: boolean, musicGain: number): number {
  return hasNarration ? musicGain * 0.35 : musicGain;
}

export async function resolveLocalMediaUrl(
  url: string,
  fetchRemote?: (path: string) => Promise<string>,
): Promise<string> {
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  try {
    const res = await fetch(url);
    if (res.ok) return URL.createObjectURL(await res.blob());
  } catch {
    // Cross-origin — try the server.
  }
  if (fetchRemote) {
    const dataUrl = await fetchRemote(url);
    const blob = await (await fetch(dataUrl)).blob();
    return URL.createObjectURL(blob);
  }
  return url;
}

function waitForVideo(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2 && Number.isFinite(video.duration)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const ok = () => resolve();
    const fail = () => reject(new Error("Video failed to load"));
    video.addEventListener("loadeddata", ok, { once: true });
    video.addEventListener("error", fail, { once: true });
  });
}

export async function mixVideoWithAudio(input: MixInputs): Promise<Blob> {
  const video = document.createElement("video");
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.src = input.videoUrl;
  video.muted = false;
  video.volume = 0;
  document.body.appendChild(video);
  video.style.cssText = "position:fixed;left:-9999px;width:4px;height:4px;opacity:0;pointer-events:none";

  try {
    await waitForVideo(video);
    const duration =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : input.durationHint && input.durationHint > 0
          ? input.durationHint
          : 6;

    const audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") await audioCtx.resume();
    const dest = audioCtx.createMediaStreamDestination();
    const startAt = audioCtx.currentTime + 0.08;
    const hasNarration = Boolean(input.narrationBuffer) && input.narrationGain > 0.01;
    const hasMusic = Boolean(input.musicBuffer) && input.musicGain > 0.01;

    if (input.originalGain > 0.01) {
      try {
        const src = audioCtx.createMediaElementSource(video);
        const g = audioCtx.createGain();
        g.gain.value = input.originalGain;
        src.connect(g).connect(dest);
      } catch {
        // Element already connected or no audio — music/VO still mix.
      }
    }

    if (hasMusic && input.musicBuffer) {
      const src = audioCtx.createBufferSource();
      src.buffer = input.musicBuffer;
      src.loop = true;
      const g = audioCtx.createGain();
      g.gain.value = duckMusic(hasNarration, input.musicGain);
      src.connect(g).connect(dest);
      src.start(startAt);
      src.stop(startAt + duration + 0.25);
    }

    if (hasNarration && input.narrationBuffer) {
      const src = audioCtx.createBufferSource();
      src.buffer = input.narrationBuffer;
      const g = audioCtx.createGain();
      g.gain.value = input.narrationGain;
      src.connect(g).connect(dest);
      src.start(startAt);
    }

    if (dest.stream.getAudioTracks().length === 0) {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(dest);
      osc.start(startAt);
      osc.stop(startAt + duration + 0.25);
    }

    video.currentTime = 0;
    await video.play();

    const combined = await videoStream(video, dest.stream);
    const mime = pickMime();
    const recorder = new MediaRecorder(combined, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onerror = () => reject(new Error("Recorder failed"));
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
      };
    });

    recorder.start(200);
    await wait(duration * 1000 + 180);
    if (recorder.state !== "inactive") recorder.stop();
    video.pause();
    combined.getTracks().forEach((t) => t.stop());
    void audioCtx.close();
    return done;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  }
}

async function videoStream(video: HTMLVideoElement, audio: MediaStream): Promise<MediaStream> {
  try {
    const captured = captureVideoStream(video);
    const tracks = captured.getVideoTracks();
    if (tracks.length > 0 && tracks[0]!.readyState === "live") {
      return new MediaStream([...tracks, ...audio.getAudioTracks()]);
    }
  } catch {
    // Fall through to canvas.
  }
  return canvasStream(video, audio);
}

function captureVideoStream(video: HTMLVideoElement): MediaStream {
  const v = video as HTMLVideoElement & {
    captureStream?: (fps?: number) => MediaStream;
    mozCaptureStream?: (fps?: number) => MediaStream;
  };
  const fn = v.captureStream ?? v.mozCaptureStream;
  if (!fn) throw new Error("This browser cannot capture the video stream for mixing.");
  return fn.call(video, 30);
}

function canvasStream(video: HTMLVideoElement, audio: MediaStream): MediaStream {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw this video for mixing.");
  let running = true;
  const draw = () => {
    if (!running) return;
    ctx.drawImage(video, 0, 0, w, h);
    requestAnimationFrame(draw);
  };
  draw();
  const stream = canvas.captureStream(30);
  const audioTracks = audio.getAudioTracks();
  audioTracks.forEach((t) => stream.addTrack(t));
  const v = stream.getVideoTracks()[0];
  if (v) {
    const stop = v.stop.bind(v);
    v.stop = () => {
      running = false;
      stop();
    };
  }
  return stream;
}

export async function decodeAudioFile(file: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  const buf = await file.arrayBuffer();
  const audio = await ctx.decodeAudioData(buf.slice(0));
  void ctx.close();
  return audio;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function pickMime(): string | undefined {
  const types = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t));
}

function wait(ms: number) {
  return new Promise((r) => window.setTimeout(r, ms));
}
