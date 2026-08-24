import Link from "next/link";
import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) {
  return <div data-ui-card className={cn("premium-card min-w-0 rounded-[8px] border border-[var(--line)] bg-[var(--panel)] text-[var(--foreground)] shadow-sm", className)} {...props}>{children}</div>;
}

export function Button({
  className,
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "purple" | "ghost" | "destructive" }) {
  return (
    <button
      data-ui-button
      className={cn(
        "inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-[8px] px-5 py-3 text-center text-sm font-bold leading-tight transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/70 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-[var(--gold)] text-black hover:bg-yellow-300 gold-glow",
        variant === "secondary" && "border border-[var(--gold-strong)] bg-transparent text-[var(--foreground)] hover:bg-yellow-400/10",
        variant === "purple" && "purple-gradient text-white shadow-[0_0_30px_rgba(118,92,246,.28)]",
        variant === "ghost" && "border border-[var(--line)] bg-[var(--panel-2)] text-[var(--foreground)] hover:bg-[var(--panel-3)]",
        variant === "destructive" && "border border-red-300 bg-red-700 text-white hover:bg-red-800",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({ href, children, className, variant = "primary", onClick }: { href: string; children: React.ReactNode; className?: string; variant?: "primary" | "secondary" | "purple" | "ghost"; onClick?: React.MouseEventHandler<HTMLAnchorElement> }) {
  return (
    <Link
      data-ui-button
      href={href}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-[8px] px-5 py-3 text-center text-sm font-bold leading-tight transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/70",
        variant === "primary" && "bg-[var(--gold)] text-black hover:bg-yellow-300 gold-glow",
        variant === "secondary" && "border border-[var(--gold-strong)] text-[var(--foreground)] hover:bg-yellow-400/10",
        variant === "purple" && "purple-gradient text-white",
        variant === "ghost" && "border border-[var(--line)] bg-[var(--panel-2)] text-[var(--foreground)] hover:bg-[var(--panel-3)]",
        className
      )}
    >
      {children}
    </Link>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h1 className="min-w-0 text-3xl font-black leading-[1.08] text-[var(--foreground)] sm:text-4xl lg:text-5xl">{title}</h1>
      {subtitle ? <p className="mt-4 max-w-3xl text-base font-medium leading-7 text-[var(--muted)] sm:text-lg">{subtitle}</p> : null}
    </div>
  );
}

export function EmptyState({ title, body, action }: { icon?: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-4 py-10 text-center sm:min-h-[420px]">
      <h2 className="text-2xl font-black sm:text-3xl">{title}</h2>
      <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)] sm:text-xl">{body}</p>
      {action ? <div className="mt-8">{action}</div> : null}
    </div>
  );
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2.5 block text-sm font-bold text-[var(--foreground)]">{label}</span>
      {children}
    </label>
  );
}

export const inputClass = "min-h-12 w-full rounded-[8px] border border-[var(--line)] bg-[var(--field)] px-4 py-3 text-base text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted-soft)] focus:border-[var(--gold-strong)] focus:ring-2 focus:ring-[var(--gold)]/20";
export const textareaClass = "min-h-28 w-full rounded-[8px] border border-[var(--line)] bg-[var(--field)] px-4 py-3 text-base leading-6 text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted-soft)] focus:border-[var(--gold-strong)] focus:ring-2 focus:ring-[var(--gold)]/20";
