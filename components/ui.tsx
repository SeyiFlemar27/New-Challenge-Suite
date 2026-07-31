import Link from "next/link";
import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) {
  return <div data-ui-card className={cn("premium-card min-w-0 rounded-[8px] border border-white/10 bg-[#121212] shadow-sm", className)} {...props}>{children}</div>;
}

export function Button({
  className,
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "purple" | "ghost" }) {
  return (
    <button
      data-ui-button
      className={cn(
        "inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-[8px] px-5 py-3 text-center text-sm font-bold leading-tight transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/70 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-[var(--gold)] text-black hover:bg-yellow-300 gold-glow",
        variant === "secondary" && "border border-[var(--gold)] bg-transparent text-white hover:bg-yellow-400/10",
        variant === "purple" && "purple-gradient text-white shadow-[0_0_30px_rgba(118,92,246,.28)]",
        variant === "ghost" && "bg-[#1d1d1d] text-white hover:bg-[#242424]",
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
        variant === "secondary" && "border border-[var(--gold)] text-white hover:bg-yellow-400/10",
        variant === "purple" && "purple-gradient text-white",
        variant === "ghost" && "bg-[#1d1d1d] text-white",
        className
      )}
    >
      {children}
    </Link>
  );
}

export function PageTitle({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h1 className="flex min-w-0 items-start gap-3 text-3xl font-black leading-[1.08] text-white sm:text-4xl lg:text-5xl">{icon ? <span className="mt-1 shrink-0 text-[var(--gold)]">{icon}</span> : null}<span className="min-w-0">{title}</span></h1>
      {subtitle ? <p className="mt-4 max-w-3xl text-base font-medium leading-7 text-slate-400 sm:text-lg">{subtitle}</p> : null}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-4 py-10 text-center sm:min-h-[420px]">
      <div className="mb-6 text-5xl text-slate-500 sm:mb-8 sm:text-6xl">{icon}</div>
      <h2 className="text-2xl font-black sm:text-3xl">{title}</h2>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#8fa6ca] sm:text-xl">{body}</p>
      {action ? <div className="mt-8">{action}</div> : null}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2.5 block text-sm font-bold text-white">{label}</span>
      {children}
    </label>
  );
}

export const inputClass = "min-h-12 w-full rounded-[8px] border border-white/10 bg-[#171717] px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10";
export const textareaClass = "min-h-28 w-full rounded-[8px] border border-white/10 bg-[#171717] px-4 py-3 text-base leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10";
