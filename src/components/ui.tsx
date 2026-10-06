import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "../utils/cn";

export function Panel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-border bg-surface shadow-card", className)} {...rest} />;
}

export function PanelHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-between gap-3 border-b border-border bg-surface-2/60 px-4 py-2.5 rounded-t-2xl", className)}
      {...rest}
    />
  );
}

export function PanelTitle({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2 font-mono text-xs font-semibold tracking-wide text-muted">
      {icon && <span className="text-gold">{icon}</span>}
      {children}
    </span>
  );
}

type Variant = "primary" | "outline" | "ghost" | "subtle";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-gold text-gold-ink hover:bg-gold-bright shadow-sm shadow-gold/20 font-semibold",
  outline: "border border-border-strong text-text hover:border-gold hover:text-gold bg-transparent",
  ghost: "text-muted hover:text-text hover:bg-surface-2",
  subtle: "bg-surface-2 text-text hover:bg-border/60 border border-border",
};
const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs rounded-lg gap-1.5",
  md: "px-4 py-2 text-sm rounded-xl gap-2",
  lg: "px-5 py-3 text-base rounded-xl gap-2",
};

export function Button({
  variant = "subtle",
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    />
  );
}

export function LinkButton({
  variant = "subtle",
  size = "md",
  className,
  ...rest
}: HTMLAttributes<HTMLAnchorElement> & { href: string; target?: string; rel?: string; variant?: Variant; size?: Size }) {
  return (
    <a
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    />
  );
}

export type Tone = "ok" | "warn" | "info" | "err" | "gold" | "muted";
const tones: Record<Tone, string> = {
  ok: "text-ok border-ok/30 bg-ok/10",
  warn: "text-warn border-warn/30 bg-warn/10",
  info: "text-info border-info/30 bg-info/10",
  err: "text-err border-err/30 bg-err/10",
  gold: "text-gold border-gold/30 bg-gold/10",
  muted: "text-muted border-border bg-surface-2",
};

export function Badge({ tone = "muted", className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider", tones[tone], className)}
      {...rest}
    />
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-gold", className)}>
      <span className="h-px w-6 bg-gold/60" />
      {children}
    </span>
  );
}

export function SectionIntro({ eyebrow, title, lede, align = "left" }: { eyebrow: string; title: ReactNode; lede?: ReactNode; align?: "left" | "center" }) {
  return (
    <div className={cn("space-y-3", align === "center" && "text-center")}>
      <Eyebrow className={cn(align === "center" && "justify-center")}>{eyebrow}</Eyebrow>
      <h2 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-text text-balance">{title}</h2>
      {lede && <p className={cn("text-muted text-base leading-relaxed max-w-2xl text-pretty", align === "center" && "mx-auto")}>{lede}</p>}
    </div>
  );
}

export function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn("h-4 w-4 fill-current", className)}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>;
}
