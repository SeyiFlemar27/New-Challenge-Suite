import Link from "next/link";
import { BrandLogo } from "@/components/brand";
import { MobileFooter } from "@/components/mobile-footer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-black">
      <header className="grid min-h-16 grid-cols-[44px_minmax(0,1fr)_44px] items-center border-b border-white/10 px-4 lg:hidden" data-mobile-header>
        <Link href="/landing" className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10 text-sm font-black" aria-label="Back to home">‹</Link>
        <Link href="/landing" className="flex min-w-0 items-center justify-center gap-2">
          <BrandLogo imageClassName="h-9 w-9 border border-[var(--gold)]" />
          <span className="truncate text-sm font-black uppercase tracking-[0.1em]">Challenge Suite</span>
        </Link>
        <span aria-hidden="true" />
      </header>
      {children}
      <MobileFooter />
    </div>
  );
}
