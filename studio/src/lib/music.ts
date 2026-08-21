export const MUSIC_BEDS = [
  {
    id: "tidal",
    title: "Tidal",
    url: "/audio/tidal.mp3",
    detail: "Slow low pad — letterhead quiet",
  },
  {
    id: "lab",
    title: "Lab",
    url: "/audio/lab.mp3",
    detail: "Warmer fifths, sim-lab hush",
  },
  {
    id: "pulse",
    title: "Pulse",
    url: "/audio/pulse.mp3",
    detail: "A gentle lift for close/CTA cuts",
  },
] as const;

export const VOICES = [
  { id: "eve", label: "Eve", detail: "Clear, measured" },
  { id: "ara", label: "Ara", detail: "Warm, clinical" },
  { id: "rex", label: "Rex", detail: "Confident, low" },
  { id: "sal", label: "Sal", detail: "Smooth, even" },
] as const;
