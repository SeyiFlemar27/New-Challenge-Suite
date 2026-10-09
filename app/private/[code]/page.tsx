"use client";

import { useParams } from "next/navigation";
import { PrivateAdmission } from "@/components/private-admission";

export default function PrivateCodeAdmissionPage() {
  const params = useParams<{ code: string }>();
  return <PrivateAdmission credential={String(params.code ?? "")} label="code" />;
}
