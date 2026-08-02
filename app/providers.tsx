"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "@/components/auth-provider";
import { VerificationGuard } from "@/components/verification-guard";
import { AppThemeProvider } from "@/components/app-theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><AuthProvider><AppThemeProvider><VerificationGuard>{children}</VerificationGuard></AppThemeProvider></AuthProvider></QueryClientProvider>;
}
