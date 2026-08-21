import { cn } from "@/lib/cn";

export function Mark({ className, ink = false }: { className?: string; ink?: boolean }) {
  const a = ink ? "#12202A" : "#6EB8B4";
  const b = ink ? "#2A8A86" : "#E8EEF0";
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-7", className)}
      aria-hidden
    >
      <rect width="32" height="32" rx="8" fill={ink ? "#F4F0E8" : "#141B21"} />
      <path
        d="M9 20.5c3.2-1.2 5.2-4.4 5.2-7.8 0 3.4 2 6.6 5.2 7.8"
        fill="none"
        stroke={a}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M9 12.5c3.2 1.2 5.2 4.4 5.2 7.8 0-3.4 2-6.6 5.2-7.8"
        fill="none"
        stroke={b}
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

export function Wordmark({
  className,
  onPaper = false,
}: {
  className?: string;
  onPaper?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2",
        onPaper ? "text-ink" : "text-fg",
        className,
      )}
    >
      <Mark className="size-6" ink={onPaper} />
      <span className="text-[13px] font-medium tracking-[0.18em] uppercase">
        Encountive
      </span>
    </span>
  );
}
