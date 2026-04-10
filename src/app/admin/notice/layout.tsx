"use client";

import React from "react";

const MAX_W = 1700;

export default function NoticeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto", background: "#fff", minHeight: "calc(100vh - 60px)" }}>
      {children}
    </div>
  );
}
