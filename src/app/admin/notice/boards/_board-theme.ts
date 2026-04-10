import type { CSSProperties } from "react";

export const boardPageShellStyle: CSSProperties = {
  display: "grid",
  gap: 24,
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
  border: "1px solid #e2ecf4",
  borderRadius: 20,
  background: "#ffffff",
  boxShadow: "0 4px 24px rgba(2,32,46,0.06)",
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
  height: 40,
  padding: "0 18px",
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
  color: "#ffffff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  fontWeight: 700,
  fontSize: 14,
  boxShadow: "0 4px 14px rgba(16,59,83,0.22)",
  cursor: "pointer",
  letterSpacing: 0.2,
};

export const boardGhostButtonStyle: CSSProperties = {
  height: 40,
  padding: "0 18px",
  borderRadius: 10,
  border: "1px solid #d0e0ec",
  background: "#f5f9fc",
  color: "#355468",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

export const boardDangerButtonStyle: CSSProperties = {
  height: 40,
  padding: "0 18px",
  borderRadius: 10,
  border: "1px solid #fecaca",
  background: "#fff5f5",
  color: "#b42318",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

export const boardInputStyle: CSSProperties = {
  width: "100%",
  height: 42,
  borderRadius: 10,
  border: "1px solid #d0e0ec",
  padding: "0 14px",
  background: "#f5f9fc",
  color: "#103b53",
  fontWeight: 600,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

export const boardTextareaStyle: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid #d0e0ec",
  padding: 16,
  background: "#f5f9fc",
  color: "#103b53",
  fontWeight: 600,
  lineHeight: 1.7,
  resize: "vertical",
  outline: "none",
  boxSizing: "border-box",
};
