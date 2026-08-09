"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "@/components/auth-provider";
import { VerificationGuard } from "@/components/verification-guard";
import { AppThemeProvider } from "@/components/app-theme-provider";
import { I18nProvider } from "@/components/i18n/i18n-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><AuthProvider><AppThemeProvider><I18nProvider><VerificationGuard>{children}</VerificationGuard></I18nProvider></AppThemeProvider></AuthProvider></QueryClientProvider>;
}
