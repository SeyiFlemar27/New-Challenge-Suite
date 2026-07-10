import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#050505", color: "#d6ad3f", border: "4px solid #d6ad3f", borderRadius: "16px", fontSize: 34, fontWeight: 900 }}>CS</div>,
    size
  );
}
