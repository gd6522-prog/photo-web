"use client";

import React from "react";

const MAX_W = 1700;

export default function NoticeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <main>{children}</main>
    </div>
  );
}
