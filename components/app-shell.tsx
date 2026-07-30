import { Sidebar } from "./sidebar";
import { ProductWalkthrough } from "./product-walkthrough";
import { MobileFooter } from "./mobile-footer";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell min-h-screen overflow-x-hidden bg-black">
      <Sidebar />
      <ProductWalkthrough />
      <main className="min-w-0 px-4 pb-10 pt-6 sm:px-6 md:px-8 lg:ml-[320px] lg:px-10 lg:pb-14 lg:pt-10 xl:ml-[360px] xl:px-12">
        <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        <MobileFooter />
      </main>
    </div>
  );
}
