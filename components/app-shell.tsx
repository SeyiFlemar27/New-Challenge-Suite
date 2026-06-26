import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell min-h-screen overflow-x-hidden bg-black">
      <Sidebar />
      <main className="min-w-0 px-4 pb-28 pt-5 sm:px-5 lg:ml-[320px] lg:px-10 lg:pb-8 lg:pt-6 xl:ml-[360px] xl:px-12">{children}</main>
    </div>
  );
}
