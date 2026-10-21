"use client";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { MobileFooter } from "./mobile-footer";
import { AuthenticatedTopbar } from "./authenticated-topbar";
import { AccountDeletionGuard } from "./account-deletion-guard";
import { WorkspaceRouteBoundary } from "./workspace-route-boundary";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const dashboardHome = ["/dashboard", "/dashboard/host", "/enterprise"].includes(pathname);
  return (
    <AccountDeletionGuard>
      <WorkspaceRouteBoundary>
        <div className={(dashboardHome ? "dashboard-workspace " : "") + "app-shell theme-workspace min-h-screen overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]"} data-i18n-ui>
          <a href="#main-content" className="sr-only z-[120] rounded-[8px] bg-[var(--gold)] px-4 py-3 font-black text-black focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to Main Content</a>
          <Sidebar />
          <div className="dashboard-topbar-wrap lg:ml-[320px] xl:ml-[360px]">
            <AuthenticatedTopbar />
          </div>
          <main id="main-content" tabIndex={-1} className="dashboard-main min-w-0 px-4 pb-10 pt-6 sm:px-6 md:px-8 lg:ml-[320px] lg:px-10 lg:pb-14 lg:pt-10 xl:ml-[360px] xl:px-12">
            <div className="mx-auto w-full max-w-[1600px]">{children}</div>
            {!dashboardHome ? <MobileFooter /> : null}
          </main>
        </div>
      </WorkspaceRouteBoundary>
    </AccountDeletionGuard>
  );
}
