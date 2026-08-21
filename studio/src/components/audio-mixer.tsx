import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Mic, Music, Sparkles, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchPublicAsDataUrl, synthesizeNarration, writeVoiceover } from "@/lib/ai";
import { cn } from "@/lib/cn";
import {
  decodeAudioFile,
  downloadBlob,
  duckMusic,
  mixVideoWithAudio,
  resolveLocalMediaUrl,
  stashMix,
} from "@/lib/mix-audio";
import { MUSIC_BEDS, VOICES } from "@/lib/music";

type Props = {
  id: string;
  videoUrl: string;
  posterUrl?: string;
  title: string;
  caption: string;
  duration: number;
  onMixed?: (blob: Blob, objectUrl: string, label: string) => void;
};

export function AudioMixer({
  id,
  videoUrl,
  posterUrl,
  title,
  caption,
  duration,
  onMixed,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const narrRef = useRef<HTMLAudioElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recStream = useRef<MediaStream | null>(null);

  const [sourceUrl] = useState(videoUrl);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [originalGain, setOriginalGain] = useState(0.2);
  const [musicId, setMusicId] = useState<string>("none");
  const [musicGain, setMusicGain] = useState(0.5);
  const [uploadMusic, setUploadMusic] = useState<File | null>(null);
  const [uploadMusicUrl, setUploadMusicUrl] = useState<string | null>(null);
  const [script, setScript] = useState("");
  const [voiceId, setVoiceId] = useState("eve");
  const [narrationUrl, setNarrationUrl] = useState<string | null>(null);
  const [narrGain, setNarrGain] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [bakedUrl, setBakedUrl] = useState<string | null>(null);
  const [bakedKind, setBakedKind] = useState<string | null>(null);

  const musicOn = musicId !== "none" || Boolean(uploadMusic);
  const narrOn = Boolean(narrationUrl);
  const musicSrc = uploadMusicUrl ?? (musicId !== "none" ? MUSIC_BEDS.find((b) => b.id === musicId)?.url : undefined);

  useEffect(() => {
    let cancelled = false;
    resolveLocalMediaUrl(sourceUrl, async (path) => {
      const res = await fetchPublicAsDataUrl({ data: { path } });
      if (!res.ok) throw new Error(res.error);
      return res.dataUrl;
    })
      .then((url) => {
        if (!cancelled) setLocalUrl(url);
      })
      .catch(() => {
        if (!cancelled) setLocalUrl(sourceUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceUrl]);

  useEffect(() => {
    if (uploadMusic) {
      const url = URL.createObjectURL(uploadMusic);
      setUploadMusicUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setUploadMusicUrl(null);
    return undefined;
  }, [uploadMusic]);

  useEffect(() => {
    setBakedUrl(null);
    setBakedKind(null);
  }, [musicId, uploadMusic, narrationUrl, originalGain, musicGain, narrGain]);

  function syncVolumes() {
    const music = musicRef.current;
    const narr = narrRef.current;
    if (music) music.volume = Math.min(1, duckMusic(narrOn, musicGain));
    if (narr) narr.volume = Math.min(1, narrGain);
  }

  function onPlay() {
    if (bakedUrl) return;
    const v = videoRef.current;
    syncVolumes();
    const t = v?.currentTime ?? 0;
    const music = musicRef.current;
    const narr = narrRef.current;
    if (musicOn && music && musicSrc) {
      try {
        if (music.duration && Number.isFinite(music.duration)) {
          music.currentTime = t % music.duration;
        }
      } catch {
        /* seek before metadata */
      }
      void music.play().catch(() => undefined);
    }
    if (narrOn && narr) {
      try {
        narr.currentTime = Math.min(t, narr.duration || t);
      } catch {
        /* seek before metadata */
      }
      void narr.play().catch(() => undefined);
    }
  }

  function onPause() {
    musicRef.current?.pause();
    narrRef.current?.pause();
  }

  function onSeek() {
    if (bakedUrl) return;
    const v = videoRef.current;
    const t = v?.currentTime ?? 0;
    const music = musicRef.current;
    const narr = narrRef.current;
    try {
      if (music && music.duration) music.currentTime = t % music.duration;
    } catch {
      /* ignore */
    }
    try {
      if (narr) narr.currentTime = t;
    } catch {
      /* ignore */
    }
  }

  async function loadMusicBuffer(): Promise<AudioBuffer | undefined> {
    if (!musicOn) return undefined;
    const src = uploadMusic
      ? uploadMusic
      : await (await fetch(MUSIC_BEDS.find((b) => b.id === musicId)!.url)).blob();
    return decodeAudioFile(src);
  }

  async function onWrite() {
    setBusy("script");
    const res = await writeVoiceover({
      data: { caption, title, seconds: Math.min(duration, 10) },
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setScript(res.script);
  }

  async function onSpeak() {
    if (!script.trim()) {
      toast.error("Write or generate a script first.");
      return;
    }
    setBusy("tts");
    const res = await synthesizeNarration({ data: { text: script, voiceId } });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setNarrationUrl(res.dataUrl);
    toast.success("Narration is ready. Press play to hear it over the picture.");
  }

  async function onRecord() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStream.current = stream;
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const stopped = new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      });
      rec.start();
      setBusy("record");
      toast.message("Recording… tap stop when the line is done.");
      const blob = await stopped;
      recStream.current?.getTracks().forEach((t) => t.stop());
      recStream.current = null;
      recRef.current = null;
      setBusy(null);
      setNarrationUrl(URL.createObjectURL(blob));
      toast.success("Recorded. Press play to hear it over the picture.");
    } catch {
      setBusy(null);
      toast.error("Microphone permission was denied.");
    }
  }

  function stopRecord() {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    recStream.current?.getTracks().forEach((t) => t.stop());
  }

  async function onMix() {
    if (!musicOn && !narrOn) {
      toast.error("Turn on music, add narration, or both — then mix.");
      return;
    }
    const playable = localUrl ?? sourceUrl;
    setBusy("mix");
    onPause();
    try {
      const musicBuffer = await loadMusicBuffer();
      let narrationBuffer: AudioBuffer | undefined;
      if (narrationUrl) {
        const blob = await (await fetch(narrationUrl)).blob();
        narrationBuffer = await decodeAudioFile(blob);
      }
      const mixed = await mixVideoWithAudio({
        videoUrl: playable,
        originalGain,
        musicBuffer,
        musicGain,
        narrationBuffer,
        narrationGain: narrGain,
        durationHint: duration,
      });
      const url = stashMix(id, mixed);
      const kind = musicOn && narrOn ? "music + narration" : musicOn ? "music" : "narration";
      setBakedUrl(url);
      setBakedKind(kind);
      onMixed?.(mixed, url, kind);
      toast.success(`Mix ready (${kind}). Preview, download, or publish.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mix failed");
    } finally {
      setBusy(null);
    }
  }

  const displayUrl = bakedUrl ?? localUrl ?? sourceUrl;
  const mixLabel = musicOn && narrOn ? "music + narration" : musicOn ? "music" : narrOn ? "narration" : "tracks";

  return (
    <div className="space-y-4">
      <video
        ref={videoRef}
        src={displayUrl}
        poster={posterUrl}
        controls
        playsInline
        onPlay={onPlay}
        onPause={onPause}
        onSeeked={onSeek}
        className="w-full rounded-md border border-border"
      />
      {musicSrc ? <audio ref={musicRef} src={musicSrc} loop preload="auto" className="hidden" /> : null}
      {narrationUrl ? <audio ref={narrRef} src={narrationUrl} preload="auto" className="hidden" /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Track icon={<Volume2 className="size-4" />} title="Original" on={originalGain > 0.02}>
          <p className="mb-2 text-[11px] text-muted">Imagine bed, if the clip has any.</p>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={originalGain}
            onChange={(e) => setOriginalGain(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </Track>
        <Track icon={<Music className="size-4" />} title="Music" on={musicOn}>
          <div className="flex flex-wrap gap-1.5">
            <Chip
              active={musicId === "none" && !uploadMusic}
              onClick={() => {
                setMusicId("none");
                setUploadMusic(null);
              }}
            >
              Off
            </Chip>
            {MUSIC_BEDS.map((b) => (
              <Chip
                key={b.id}
                active={musicId === b.id && !uploadMusic}
                onClick={() => {
                  setMusicId(b.id);
                  setUploadMusic(null);
                }}
              >
                {b.title}
              </Chip>
            ))}
          </div>
          <label className="mt-2 block text-[11px] text-muted">
            Or upload a bed
            <input
              type="file"
              accept="audio/*"
              className="mt-1 block w-full text-xs"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setUploadMusic(f);
                  setMusicId("none");
                }
              }}
            />
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={musicGain}
            onChange={(e) => setMusicGain(Number(e.target.value))}
            className="mt-2 w-full accent-accent"
            disabled={!musicOn}
          />
        </Track>
        <Track icon={<Mic className="size-4" />} title="Narration" on={narrOn}>
          <div className="flex flex-wrap gap-1.5">
            {VOICES.map((v) => (
              <Chip key={v.id} active={voiceId === v.id} onClick={() => setVoiceId(v.id)}>
                {v.label}
              </Chip>
            ))}
            {narrOn ? (
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-[11px] text-muted"
                onClick={() => setNarrationUrl(null)}
              >
                <X className="size-3" />
                Clear
              </button>
            ) : null}
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={narrGain}
            onChange={(e) => setNarrGain(Number(e.target.value))}
            className="mt-2 w-full accent-accent"
            disabled={!narrOn}
          />
        </Track>
      </div>

      <div className="space-y-2">
        <Label>Voiceover script</Label>
        <Textarea
          rows={3}
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Optional. Generate, write, record, or upload a VO — independent of music."
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={onWrite}>
            {busy === "script" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Write VO
          </Button>
          <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={onSpeak}>
            {busy === "tts" ? <Loader2 className="size-3.5 animate-spin" /> : <Mic className="size-3.5" />}
            Speak
          </Button>
          {busy === "record" ? (
            <Button size="sm" variant="danger" onClick={stopRecord}>
              Stop recording
            </Button>
          ) : (
            <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={onRecord}>
              Record
            </Button>
          )}
          <label className="inline-flex h-8 cursor-pointer items-center rounded-sm border border-border bg-elevated px-3 text-xs">
            Upload VO
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setNarrationUrl(URL.createObjectURL(f));
              }}
            />
          </label>
        </div>
        {narrationUrl ? <audio src={narrationUrl} controls className="w-full" /> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={Boolean(busy) || (!musicOn && !narrOn)} onClick={onMix}>
          {busy === "mix" ? <Loader2 className="size-4 animate-spin" /> : null}
          Mix {mixLabel}
        </Button>
        {bakedUrl ? (
          <Button
            variant="secondary"
            onClick={async () => {
              const blob = await (await fetch(bakedUrl)).blob();
              const ext = blob.type.includes("mp4") ? "mp4" : "webm";
              downloadBlob(blob, `${title.replace(/\s+/g, "-").toLowerCase()}-mix.${ext}`);
            }}
          >
            Download mix
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        Music, narration, or both — each is optional. Press play to hear tracks live; Mix
        bakes them into the file for download and publish. Music ducks under VO.
        {bakedKind ? ` Current bake: ${bakedKind}.` : ""}
      </p>
    </div>
  );
}

function Track({
  icon,
  title,
  on,
  children,
}: {
  icon: ReactNode;
  title: string;
  on: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-elevated p-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-medium">
        {icon}
        {title}
        <span className={cn("ml-auto text-[10px] uppercase tracking-wider", on ? "text-accent" : "text-subtle")}>
          {on ? "On" : "Off"}
        </span>
      </p>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 rounded-full border px-2.5 text-[11px]",
        active ? "border-accent bg-accent/10 text-accent" : "border-border text-muted",
      )}
    >
      {children}
    </button>
  );
}
