import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 84, background: "#050505", color: "white" }}>
      <div style={{ color: "#d6ad3f", fontSize: 24, fontWeight: 800, letterSpacing: 4 }}>CHALLENGE SUITE</div>
      <div style={{ marginTop: 30, maxWidth: 960, fontSize: 78, lineHeight: 1.05, fontWeight: 900 }}>Competition, made intentional.</div>
      <div style={{ marginTop: 30, fontSize: 28, color: "#b8b8b8" }}>Create. Enter. Vote. Host. Partner.</div>
    </div>,
    size
  );
}
