import type { CSSProperties } from "react";

export const boardPageShellStyle: CSSProperties = {
  display: "grid",
  gap: 18,
};

export const boardHeroStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  border: "1px solid #c9d9e4",
  borderRadius: 24,
  background: "linear-gradient(135deg,#f7fbfd 0%,#edf6f8 42%,#fdfefe 100%)",
  boxShadow: "0 18px 38px rgba(2,32,46,0.08)",
};

export const boardHeroAccentStyle: CSSProperties = {
  position: "absolute",
  inset: "auto -60px -90px auto",
  width: 220,
  height: 220,
  borderRadius: 4,
  background: "radial-gradient(circle at center, rgba(15,118,110,0.22) 0%, rgba(15,118,110,0.08) 42%, rgba(15,118,110,0) 72%)",
  pointerEvents: "none",
};

export const boardCardStyle: CSSProperties = {
  border: "1px solid #c9d9e4",
  borderRadius: 22,
  background: "#ffffff",
  boxShadow: "0 16px 34px rgba(2,32,46,0.08)",
  overflow: "hidden",
};

export const boardSectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 950,
  color: "#103b53",
  letterSpacing: 0.1,
};

export const boardSectionSubtleStyle: CSSProperties = {
  fontSize: 12,
  color: "#557186",
};

export const boardPrimaryButtonStyle: CSSProperties = {
  height: 42,
  padding: "0 16px",
  borderRadius: 0,
  border: "1px solid #0e7490",
  background: "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
  color: "#ffffff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  fontWeight: 950,
  boxShadow: "0 10px 22px rgba(16,59,83,0.18)",
  cursor: "pointer",
};

export const boardGhostButtonStyle: CSSProperties = {
  height: 42,
  padding: "0 16px",
  borderRadius: 0,
  border: "1px solid #c4d5e3",
  background: "#ffffff",
  color: "#103b53",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  fontWeight: 900,
  cursor: "pointer",
};

export const boardDangerButtonStyle: CSSProperties = {
  height: 42,
  padding: "0 16px",
  borderRadius: 0,
  border: "1px solid #f5b7b7",
  background: "#fff5f5",
  color: "#b42318",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  fontWeight: 900,
  cursor: "pointer",
};

export const boardInputStyle: CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 0,
  border: "1px solid #c4d5e3",
  padding: "0 14px",
  background: "#ffffff",
  color: "#103b53",
  fontWeight: 700,
  outline: "none",
  boxSizing: "border-box",
};

export const boardTextareaStyle: CSSProperties = {
  width: "100%",
  borderRadius: 0,
  border: "1px solid #c4d5e3",
  padding: 16,
  background: "#ffffff",
  color: "#103b53",
  fontWeight: 600,
  lineHeight: 1.7,
  resize: "vertical",
  outline: "none",
  boxSizing: "border-box",
};
