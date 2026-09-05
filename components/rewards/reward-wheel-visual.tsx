"use client";

import { useMemo } from "react";
import { buildRewardWheelSegments } from "@/lib/reward-wheel-geometry";

type WheelItem = { id: string; prizeName: string; resolvedProbability?: number };

const palette = [
  { color: "#f6c64b", textColor: "#17120a" },
  { color: "#25231f", textColor: "#f8e7b3" },
  { color: "#d2a94b", textColor: "#15100a" },
  { color: "#f0dfad", textColor: "#18120b" },
  { color: "#171717", textColor: "#f6c64b" },
];

const center = 50;
const radius = 49;

function polar(angle: number, distance = radius) {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: center + distance * Math.cos(radians), y: center + distance * Math.sin(radians) };
}

function arc(startAngle: number, endAngle: number) {
  const start = polar(endAngle);
  const end = polar(startAngle);
  return [`M ${center} ${center}`, `L ${start.x} ${start.y}`, `A ${radius} ${radius} 0 ${endAngle - startAngle > 180 ? 1 : 0} 0 ${end.x} ${end.y}`, "Z"].join(" ");
}

export function RewardWheelVisual({ items, label, rotation = 0, spinning = false, showPointer = true, centerLabel = "SPIN", showAccessibleProbabilities = false }: { items: WheelItem[]; label: string; rotation?: number; spinning?: boolean; showPointer?: boolean; centerLabel?: string; showAccessibleProbabilities?: boolean }) {
  const segments = useMemo(() => buildRewardWheelSegments(items), [items]);
  if (!segments.length) return null;

  return <div className="relative aspect-square w-full" role="img" aria-label={label}>
    {showPointer ? <div className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 border-x-[14px] border-t-[26px] border-x-transparent border-t-[var(--gold)]" aria-hidden="true" /> : null}
    <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-2xl" style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4.2s cubic-bezier(.12,.7,.08,1)" : "none" }} aria-hidden="true">
      {segments.map((segment, index) => {
        const colors = palette[index % palette.length];
        const labelPoint = polar(segment.midpoint, 32);
        const angle = segment.endAngle - segment.startAngle;
        const shortLabel = segment.prizeName.length > 15 ? `${segment.prizeName.slice(0, 12)}...` : segment.prizeName;
        return <g key={segment.id}>
          <path d={arc(segment.startAngle, segment.endAngle)} fill={colors.color} stroke="#f7df9b" strokeWidth="0.35" />
          {angle >= 12 ? <text x={labelPoint.x} y={labelPoint.y} fill={colors.textColor} fontSize="3.1" fontWeight="800" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${segment.midpoint} ${labelPoint.x} ${labelPoint.y})`}>{shortLabel}</text> : null}
        </g>;
      })}
      <circle cx="50" cy="50" r="9" fill="#111" stroke="#f6c64b" strokeWidth="1" />
      <text x="50" y="50" fill="#f6c64b" fontSize="3.4" fontWeight="900" textAnchor="middle" dominantBaseline="middle">{centerLabel}</text>
    </svg>
    <ul className="sr-only">{segments.map((segment) => <li key={segment.id}>{segment.prizeName}{showAccessibleProbabilities ? `: ${(segment.probability * 100).toFixed(4)}%` : ""}</li>)}</ul>
  </div>;
}
