import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#090c14",
          color: "#f4f7ff",
          fontFamily: "Arial",
          padding: "56px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(80% 120% at 84% -10%, rgba(79,109,255,0.44), transparent 65%), radial-gradient(60% 100% at 15% 110%, rgba(37,210,197,0.2), transparent 62%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(to right, rgba(140, 162, 220, 0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(140, 162, 220, 0.12) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            opacity: 0.55,
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", zIndex: 2 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              border: "1px solid rgba(175, 196, 248, 0.24)",
              borderRadius: "999px",
              fontSize: 20,
              padding: "10px 18px",
              color: "rgba(229,236,255,0.8)",
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: "#4f6dff",
                boxShadow: "0 0 12px rgba(79,109,255,0.8)",
              }}
            />
            BTA Courtside Intelligence
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "900px" }}>
            <p style={{ margin: 0, fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(206,216,242,0.62)" }}>
              Live Basketball Operations Platform
            </p>
            <h1 style={{ margin: 0, fontSize: 74, lineHeight: 1.05 }}>
              Stats, film, and coaching decisions from one live system.
            </h1>
            <p style={{ margin: 0, fontSize: 28, color: "rgba(229,236,255,0.8)", maxWidth: "900px" }}>
              Real-time stat keeping, synced review workflows, and AI coaching insights for competitive programs.
            </p>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
