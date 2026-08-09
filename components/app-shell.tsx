import { Sidebar } from "./sidebar";
import { ProductWalkthrough } from "./product-walkthrough";
import { MobileFooter } from "./mobile-footer";
import { AuthenticatedTopbar } from "./authenticated-topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell theme-workspace min-h-screen overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]" data-i18n-ui>
      <a href="#main-content" className="sr-only z-[120] rounded-[8px] bg-[var(--gold)] px-4 py-3 font-black text-black focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to Main Content</a>
      <Sidebar />
      <ProductWalkthrough />
      <div className="lg:ml-[320px] xl:ml-[360px]">
        <AuthenticatedTopbar />
      </div>
      <main id="main-content" tabIndex={-1} className="min-w-0 px-4 pb-10 pt-6 sm:px-6 md:px-8 lg:ml-[320px] lg:px-10 lg:pb-14 lg:pt-10 xl:ml-[360px] xl:px-12">
        <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        <MobileFooter />
      </main>
    </div>
  );
}
