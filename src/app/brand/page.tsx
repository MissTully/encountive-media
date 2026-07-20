import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveBrandKit } from "./actions";

export const dynamic = "force-dynamic";

export default async function BrandPage() {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data: kit } = await supabase
    .from("brand_kits")
    .select("id, name, colors, fonts, logo_url, voice_guidelines")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const colors = Array.isArray(kit?.colors) ? (kit.colors as string[]) : [];
  const fonts = (kit?.fonts ?? {}) as { heading?: string; body?: string };

  return (
    <div className="flex flex-1 flex-col items-center font-sans">
      <main className="flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-2">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            ← Back
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Brand kit
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Colors, fonts, logo, and voice — applied automatically to generated
            content.
          </p>
        </header>

        {colors.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <span
                key={c}
                className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white py-1 pl-1 pr-3 text-xs dark:border-zinc-800 dark:bg-zinc-950"
              >
                <span
                  className="h-5 w-5 rounded-full border border-black/10"
                  style={{ backgroundColor: c }}
                />
                <span className="font-mono text-zinc-700 dark:text-zinc-300">
                  {c}
                </span>
              </span>
            ))}
          </div>
        )}

        <form action={saveBrandKit} className="flex flex-col gap-5">
          <input type="hidden" name="id" defaultValue={kit?.id ?? ""} />

          <Field label="Name">
            <input
              name="name"
              defaultValue={kit?.name ?? ""}
              placeholder="Encountive"
              className={inputClass}
            />
          </Field>

          <Field
            label="Colors"
            hint="Comma-separated hex values, e.g. #0A0A0A, #4F46E5, #F5F5F5"
          >
            <input
              name="colors"
              defaultValue={colors.join(", ")}
              placeholder="#0A0A0A, #4F46E5, #F5F5F5"
              className={`${inputClass} font-mono`}
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Heading font">
              <input
                name="heading_font"
                defaultValue={fonts.heading ?? ""}
                placeholder="Inter"
                className={inputClass}
              />
            </Field>
            <Field label="Body font">
              <input
                name="body_font"
                defaultValue={fonts.body ?? ""}
                placeholder="Inter"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Logo URL">
            <input
              name="logo_url"
              type="url"
              defaultValue={kit?.logo_url ?? ""}
              placeholder="https://…/logo.png"
              className={inputClass}
            />
          </Field>

          <Field
            label="Voice guidelines"
            hint="Tone and style the copywriter should follow."
          >
            <textarea
              name="voice_guidelines"
              rows={4}
              defaultValue={kit?.voice_guidelines ?? ""}
              placeholder="Confident, clear, jargon-free. Speak to busy professionals."
              className={inputClass}
            />
          </Field>

          <div>
            <button
              type="submit"
              className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {kit ? "Save changes" : "Create brand kit"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}
