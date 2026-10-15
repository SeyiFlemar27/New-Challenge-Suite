"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass } from "@/components/ui";
export default function Page() {
  const [code, setCode] = useState("");
  const router = useRouter();
  return <AppShell><Card className="mx-auto max-w-xl space-y-5 p-6"><h1 className="text-2xl font-black">Enter Invitation Code</h1><p className="text-sm">Use a creator&apos;s code, including for challenges hidden from Explore. You must sign in before access is granted.</p><form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (code.trim()) router.push(`/private/${encodeURIComponent(code.trim().toUpperCase())}`); }}><Field label="Invitation Code"><input autoComplete="off" spellCheck={false} className={inputClass} maxLength={64} value={code} onChange={(event) => setCode(event.target.value)} required /></Field><Button type="submit" disabled={!code.trim()}>Continue</Button></form></Card></AppShell>;
}
