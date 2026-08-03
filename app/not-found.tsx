import { BrandLogo } from "@/components/brand";
import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-[#fafaf8] px-5 text-slate-950"><div className="w-full max-w-xl text-center"><BrandLogo imageClassName="mx-auto h-20 w-20" /><p className="mt-8 text-xs font-black uppercase tracking-[0.18em] text-amber-800">404</p><h1 className="mt-4 text-4xl font-black sm:text-5xl">This route has left the bracket.</h1><p className="mt-5 leading-7 text-slate-600">The page may have moved, or you may not have access to it.</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><LinkButton href="/challenges">Explore Challenges</LinkButton><LinkButton href="/" variant="secondary">Return Home</LinkButton></div></div></main>;
}
