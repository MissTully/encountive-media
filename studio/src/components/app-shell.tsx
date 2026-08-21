import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { FolderKanban, Images, LayoutGrid, Plus, Send, ShieldCheck, SwatchBook } from "lucide-react";
import { Toaster } from "sonner";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserButton } from "@/lib/auth/gates";
import { cn } from "@/lib/cn";
import { useStudio } from "@/lib/store";

const NAV = [
  { to: "/", label: "Studio", icon: LayoutGrid },
  { to: "/campaigns", label: "Campaigns", icon: FolderKanban },
  { to: "/library", label: "Library", icon: Images },
  { to: "/review", label: "Review", icon: ShieldCheck },
  { to: "/publish", label: "Publish", icon: Send },
  { to: "/brand", label: "Brand", icon: SwatchBook },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const reviewCount = useStudio(
    (s) => s.campaigns.filter((c) => c.status === "review" || c.status === "changes").length,
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-dvh bg-bg text-fg">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-surface md:flex">
          <Link to="/" className="flex items-center gap-2.5 px-5 py-5">
            <Mark />
            <div>
              <p className="text-sm font-medium tracking-wide">Encountive</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Studio</p>
            </div>
          </Link>
          <nav className="flex flex-1 flex-col gap-0.5 px-3">
            {NAV.map((item) => {
              const active =
                item.to === "/"
                  ? pathname === "/"
                  : pathname === item.to || pathname.startsWith(item.to + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150",
                    active
                      ? "bg-elevated text-fg"
                      : "text-muted hover:bg-elevated/60 hover:text-fg",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                  <span className="flex-1">{item.label}</span>
                  {item.to === "/review" && reviewCount > 0 ? (
                    <span className="tabular rounded-full bg-accent/15 px-1.5 text-[11px] text-accent">
                      {reviewCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="space-y-3 p-3">
            <div className="overflow-hidden px-1 text-xs [&_img]:size-6 [&_span]:max-w-24 [&_span]:truncate">
              <UserButton />
            </div>
            <Button asChild className="w-full">
              <Link to="/new">
                <Plus className="size-4" />
                New campaign
              </Link>
            </Button>
          </div>
        </aside>

        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-bg/90 px-4 backdrop-blur md:hidden">
          <Link to="/" className="flex items-center gap-2">
            <Mark className="size-6" />
            <span className="text-sm font-medium">Studio</span>
          </Link>
          <Button asChild size="sm">
            <Link to="/new">
              <Plus className="size-3.5" />
              New
            </Link>
          </Button>
        </header>

        <main className="md:pl-56">
          <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-8 md:pb-12 md:pt-8">
            {children}
          </div>
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {NAV.map((item) => {
            const active =
              item.to === "/"
                ? pathname === "/"
                : pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 text-[10px] tracking-wide",
                  active ? "text-accent" : "text-muted",
                )}
              >
                <Icon className="size-4" strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Toaster
          theme="dark"
          toastOptions={{
            classNames: {
              toast: "bg-elevated border-border text-fg",
            },
          }}
        />
      </div>
    </TooltipProvider>
  );
}
