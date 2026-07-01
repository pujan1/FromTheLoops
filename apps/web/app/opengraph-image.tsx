import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "FromTheLoop — interview experiences, from the loop";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: "#faf8f5",
          color: "#141210",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, letterSpacing: "0.14em", color: "#8a5a2b", textTransform: "uppercase" }}>
          FromTheLoop
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 96, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
            Interview experiences,
          </div>
          <div style={{ display: "flex", fontSize: 96, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
            from the loop.
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 34, color: "#5c554d", maxWidth: 900, lineHeight: 1.35 }}>
          Structured interview reports, written by the people who took them.
        </div>
      </div>
    ),
    size,
  );
}
