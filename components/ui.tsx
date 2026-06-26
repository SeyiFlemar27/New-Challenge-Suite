import Link from "next/link";
import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) {
  return <div className={cn("min-w-0 rounded-[8px] border border-white/10 bg-[#121212] shadow-sm", className)} {...props}>{children}</div>;
}

export function Button({
  className,
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "purple" | "ghost" }) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] px-5 py-2 text-center text-sm font-bold leading-tight transition disabled:cursor-not-allowed disabled:opacity-50",
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

export function LinkButton({ href, children, className, variant = "primary" }: { href: string; children: React.ReactNode; className?: string; variant?: "primary" | "secondary" | "purple" | "ghost" }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] px-5 py-2 text-center text-sm font-bold leading-tight transition",
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
      <h1 className="flex min-w-0 items-start gap-3 text-3xl font-black leading-tight text-[var(--gold-2)] sm:text-4xl">{icon ? <span className="mt-1 shrink-0">{icon}</span> : null}<span className="min-w-0 break-words">{title}</span></h1>
      {subtitle ? <p className="mt-2 max-w-4xl text-base font-semibold leading-7 text-white sm:text-lg">{subtitle}</p> : null}
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
      <span className="mb-2 block text-sm font-bold text-white">{label}</span>
      {children}
    </label>
  );
}

export const inputClass = "min-h-12 w-full rounded-[7px] border border-white/10 bg-[#1c1c1c] px-4 py-2 text-base text-white outline-none focus:border-[var(--gold)] sm:text-sm";
export const textareaClass = "min-h-24 w-full rounded-[7px] border border-white/10 bg-[#1c1c1c] px-4 py-3 text-sm text-white outline-none focus:border-[var(--gold)]";
