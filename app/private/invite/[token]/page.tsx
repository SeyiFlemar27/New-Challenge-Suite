"use client";

import { useParams } from "next/navigation";
import { PrivateAdmission } from "@/components/private-admission";

export default function PrivateLinkAdmissionPage() {
  const params = useParams<{ token: string }>();
  return <PrivateAdmission credential={String(params.token ?? "")} label="invitation" />;
}
