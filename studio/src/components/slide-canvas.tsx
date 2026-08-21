import { forwardRef } from "react";
import { Wordmark } from "@/components/mark";
import { cn } from "@/lib/cn";
import { channelAspect, type Channel, type Slide } from "@/lib/types";

type Props = {
  slide: Slide;
  index: number;
  total: number;
  channel: Channel;
  cta?: string;
  className?: string;
};

export const SlideCanvas = forwardRef<HTMLDivElement, Props>(function SlideCanvas(
  { slide, index, total, channel, cta, className },
  ref,
) {
  const aspect = channelAspect(channel);
  const photo = slide.imageUrl;

  return (
    <div
      ref={ref}
      data-slide
      className={cn(
        "relative w-full overflow-hidden rounded-[20px] bg-ink text-paper shadow-[0_20px_60px_-24px_rgba(0,0,0,0.65)]",
        className,
      )}
      style={{ aspectRatio: aspect }}
    >
      {slide.layout === "cover" && (
        <>
          <Bg photo={photo} />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/10" />
          <div className="absolute inset-0 flex flex-col justify-between p-6 sm:p-8">
            <Wordmark />
            <div className="max-w-[22ch] pb-8">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.22em] text-accent">
                {slide.kicker}
              </p>
              <h2 className="font-display text-[1.65rem] leading-[1.12] tracking-[-0.03em] text-paper sm:text-[1.85rem]">
                {slide.headline}
              </h2>
              <p className="mt-3 max-w-[32ch] text-[13px] leading-relaxed text-paper/80">
                {slide.body}
              </p>
            </div>
          </div>
        </>
      )}

      {slide.layout === "photo" && (
        <>
          <div className="absolute inset-x-0 top-0 h-[56%]">
            <Bg photo={photo} />
          </div>
          <div className="absolute inset-x-0 bottom-0 h-[46%] bg-paper px-6 pb-5 pt-6 text-ink sm:px-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink-muted">
              {slide.kicker}
            </p>
            <h2 className="mt-2 font-display text-[1.45rem] leading-[1.15] tracking-[-0.03em] text-ink">
              {slide.headline}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{slide.body}</p>
            <div className="absolute bottom-4 right-6">
              <Wordmark onPaper />
            </div>
          </div>
        </>
      )}

      {slide.layout === "stat" && (
        <div className="absolute inset-0 flex bg-ink">
          <div className="relative hidden w-[38%] sm:block">
            <Bg photo={photo} />
            <div className="absolute inset-0 bg-ink/25" />
          </div>
          <div className="flex flex-1 flex-col justify-between p-6 sm:p-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-accent">
              {slide.kicker}
            </p>
            <div>
              <p className="font-display text-[3.4rem] leading-none tracking-[-0.04em] text-paper tabular">
                {slide.statValue ?? "—"}
              </p>
              <p className="mt-3 text-sm text-accent">{slide.statLabel}</p>
              <h2 className="mt-5 max-w-[16ch] font-display text-2xl leading-snug text-paper">
                {slide.headline}
              </h2>
              <p className="mt-2 max-w-[32ch] text-[13px] leading-relaxed text-paper/75">
                {slide.body}
              </p>
            </div>
            <Wordmark />
          </div>
        </div>
      )}

      {slide.layout === "quote" && (
        <>
          <div className="absolute inset-0">
            <Bg photo={photo} />
            <div className="absolute inset-0 bg-paper/92" />
          </div>
          <div className="absolute inset-0 flex flex-col justify-between p-6 text-ink sm:p-8">
            <Wordmark onPaper />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink-muted">
                {slide.kicker}
              </p>
              <h2 className="mt-4 font-display text-[1.55rem] leading-[1.2] tracking-[-0.03em] text-ink">
                “{slide.headline}”
              </h2>
              <p className="mt-4 max-w-[34ch] text-[13px] leading-relaxed text-ink-muted">
                {slide.body}
              </p>
            </div>
            <div className="h-px w-12 bg-accent" />
          </div>
        </>
      )}

      {slide.layout === "close" && (
        <>
          <Bg photo={photo} />
          <div className="absolute inset-0 bg-ink/78" />
          <div className="absolute inset-0 flex flex-col justify-between p-6 sm:p-8">
            <Wordmark />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-accent">
                {slide.kicker}
              </p>
              <h2 className="mt-3 max-w-[14ch] font-display text-[1.85rem] leading-[1.12] text-paper">
                {slide.headline}
              </h2>
              <p className="mt-3 max-w-[30ch] text-[13px] leading-relaxed text-paper/80">
                {slide.body}
              </p>
              <div className="mt-6 inline-flex rounded-full bg-accent px-4 py-2 text-xs font-medium text-accent-fg">
                {cta || "Start with a scoped pilot."}
              </div>
            </div>
          </div>
        </>
      )}

      <span
        className={cn(
          "absolute bottom-4 left-6 font-mono text-[10px] tracking-widest tabular",
          slide.layout === "photo" || slide.layout === "quote"
            ? "text-ink-muted"
            : "text-paper/55",
        )}
      >
        {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </span>
    </div>
  );
});

function Bg({ photo }: { photo: string }) {
  if (!photo) {
    return <div className="absolute inset-0 bg-elevated" />;
  }
  return (
    <img
      src={photo}
      alt=""
      className="absolute inset-0 size-full object-cover"
      draggable={false}
    />
  );
}
