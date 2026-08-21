import { createFileRoute } from "@tanstack/react-router";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/_studio/brand")({
  component: BrandPage,
});

export function BrandPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl text-fg">Brand kit</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Grok is instructed with this kit on every generate. Imagine stills stay
          photography — never lettering — so the compositor can lock type.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Product</p>
          <p className="mt-3 font-display text-2xl text-fg">{BRAND.name}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{BRAND.product}</p>
          <p className="mt-4 text-sm text-accent">{BRAND.loop}</p>
        </div>
        <div className="rounded-xl border border-border bg-paper p-5 text-ink">
          <p className="text-[11px] uppercase tracking-[0.18em] text-ink-muted">On-canvas</p>
          <p className="mt-6 font-display text-3xl">Scenario → coaching → evidence.</p>
          <p className="mt-3 text-sm text-ink-muted">{BRAND.cta}</p>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl text-fg">Voice</h2>
        <ul className="mt-3 space-y-2">
          {BRAND.voice.map((v) => (
            <li
              key={v}
              className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-fg"
            >
              {v}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl text-fg">Facts we will stand behind</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BRAND.facts.map((f) => (
            <div key={f.label} className="rounded-lg border border-border bg-surface p-4">
              <p className="font-display text-3xl tabular text-accent">{f.value}</p>
              <p className="mt-2 text-sm text-fg">{f.label}</p>
              <p className="mt-1 text-[11px] text-muted">{f.source}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="font-display text-xl text-fg">Say</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {BRAND.claimsOk.map((c) => (
              <li key={c} className="rounded-md border border-ok/20 bg-ok/5 px-4 py-3 text-fg">
                {c}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-xl text-fg">Never say</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {BRAND.claimsNo.map((c) => (
              <li
                key={c}
                className="rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-fg"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl text-fg">Palette</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Swatch name="Ink" hex="#0B1014" className="bg-bg text-fg" />
          <Swatch name="Teal" hex="#6EB8B4" className="bg-accent text-accent-fg" />
          <Swatch name="Paper" hex="#F4F0E8" className="bg-paper text-ink" />
          <Swatch name="Surface" hex="#141B21" className="bg-surface text-fg" />
        </div>
      </section>
    </div>
  );
}

function Swatch({
  name,
  hex,
  className,
}: {
  name: string;
  hex: string;
  className: string;
}) {
  return (
    <div className={`rounded-lg border border-border p-4 ${className}`}>
      <p className="text-sm font-medium">{name}</p>
      <p className="mt-6 font-mono text-xs opacity-70">{hex}</p>
    </div>
  );
}
