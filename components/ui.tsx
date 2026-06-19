import Link from "next/link";
import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) {
  return <div className={cn("rounded-[8px] border border-white/10 bg-[#121212] shadow-sm", className)} {...props}>{children}</div>;
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
        "inline-flex h-11 items-center justify-center gap-2 rounded-[8px] px-5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
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
        "inline-flex h-11 items-center justify-center gap-2 rounded-[8px] px-5 text-sm font-bold transition",
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
    <div>
      <h1 className="flex items-center gap-3 text-4xl font-black text-[var(--gold-2)]">{icon}{title}</h1>
      {subtitle ? <p className="mt-2 text-lg font-semibold text-white">{subtitle}</p> : null}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
      <div className="mb-8 text-6xl text-slate-500">{icon}</div>
      <h2 className="text-3xl font-black">{title}</h2>
      <p className="mt-4 text-xl text-[#8fa6ca]">{body}</p>
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

export const inputClass = "h-11 w-full rounded-[7px] border border-white/10 bg-[#1c1c1c] px-4 text-sm text-white outline-none focus:border-[var(--gold)]";
export const textareaClass = "min-h-24 w-full rounded-[7px] border border-white/10 bg-[#1c1c1c] px-4 py-3 text-sm text-white outline-none focus:border-[var(--gold)]";
