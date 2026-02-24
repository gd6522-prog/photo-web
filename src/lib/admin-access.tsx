"use client";

import React, { createContext, useContext } from "react";

export type AccessLevel = "full" | "view" | "hidden";

export type MenuAccessMap = Record<string, AccessLevel>;

type AdminAccessCtx = {
  isMainAdmin: boolean;
  isGeneralAdmin: boolean;
  menuAccess: MenuAccessMap; // 일반관리자 기준 권한 맵(메인관리자는 무시)
  // 특정 메뉴키의 권한
  accessOf: (menuKey: string) => AccessLevel;
  // 읽기전용 여부(메뉴키 기준)
  isViewOnly: (menuKey: string) => boolean;
};

const Ctx = createContext<AdminAccessCtx | null>(null);

export function AdminAccessProvider(props: {
  isMainAdmin: boolean;
  isGeneralAdmin: boolean;
  menuAccess: MenuAccessMap;
  children: React.ReactNode;
}) {
  const { isMainAdmin, isGeneralAdmin, menuAccess } = props;

  const accessOf = (menuKey: string): AccessLevel => {
    if (isMainAdmin) return "full";
    return (menuAccess?.[menuKey] ?? "full") as AccessLevel; // 기본값 full = “우선 다 풀기”
  };

  const isViewOnly = (menuKey: string) => accessOf(menuKey) === "view";

  return (
    <Ctx.Provider value={{ isMainAdmin, isGeneralAdmin, menuAccess, accessOf, isViewOnly }}>
      {props.children}
    </Ctx.Provider>
  );
}

export function useAdminAccess() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdminAccess must be used inside AdminAccessProvider");
  return v;
}