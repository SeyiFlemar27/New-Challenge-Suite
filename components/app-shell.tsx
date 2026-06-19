import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="px-5 py-6 lg:ml-[320px] lg:px-10 xl:ml-[360px] xl:px-12">{children}</main>
    </div>
  );
}
