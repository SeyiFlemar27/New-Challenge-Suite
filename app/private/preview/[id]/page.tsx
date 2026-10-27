"use client";
import { useParams } from "next/navigation";
import { PrivateLockedDetail } from "@/components/private-locked-detail";
export default function Page() { const { id } = useParams<{ id: string }>(); return <PrivateLockedDetail id={id} />; }
