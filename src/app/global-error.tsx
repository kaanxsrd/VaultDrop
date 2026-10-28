"use client";

/** Last-resort boundary when the root layout itself fails. Self-contained styles only. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100dvh",
          margin: 0,
          background: "#f8f9fb",
          color: "#1b1f27",
        }}
      >
        <main style={{ textAlign: "center", padding: 16 }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>VaultDrop is temporarily unavailable</h1>
          <p style={{ color: "#5b6271", marginBottom: 16 }}>
            No secret was opened or destroyed by this error.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: 0,
              background: "#007756",
              color: "white",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
