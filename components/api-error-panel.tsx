"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button, Card, LinkButton } from "@/components/ui";

export function ApiErrorPanel({ message, onRetry, title = "We couldn't complete that request" }: { message: string; onRetry?: () => void; title?: string }) {
  return <Card className="mt-5 border-amber-300 bg-amber-50 p-4 text-slate-950" role="alert">
    <div className="flex items-start gap-3">
      <AlertCircle className="mt-0.5 shrink-0 text-amber-700" size={20} />
      <div className="min-w-0 flex-1">
        <p className="font-black">{title}</p>
        <p className="mt-1 break-words text-sm leading-6 text-slate-700">{message}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {onRetry ? <Button type="button" variant="secondary" onClick={onRetry}><RefreshCw size={15} /> Try Again</Button> : null}
          <LinkButton href="/contact" variant="ghost">Contact Support</LinkButton>
        </div>
      </div>
    </div>
  </Card>;
}
