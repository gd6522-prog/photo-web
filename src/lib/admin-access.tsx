"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * ✅ 기존 DB/코드 호환 유지:
 * - hidden / full을 그대로 사용
 * - 필요하면 view/edit로 확장 가능
 */
export type AccessLevel = "hidden" | "full" | "view" | "edit";
export type MenuAccessMap = Record<string, AccessLevel>;

const ADMIN_EMAIL = "gd6522@naver.com";
const ADMIN_UID = "bf70f0c0-3c58-444e-b69f-bd5de601deb6";

type AdminAccessState = {
  loading: boolean;
  uid: string;
  email: string;

  isMainAdmin: boolean;
  isGeneralAdmin: boolean;

  // 편의 플래그
  isAdmin: boolean;

  menuAccess: MenuAccessMap;
};

const DEFAULT_STATE: AdminAccessState = {
  loading: true,
  uid: "",
  email: "",
  isMainAdmin: false,
  isGeneralAdmin: false,
  isAdmin: false,
  menuAccess: {},
};

const Ctx = createContext<AdminAccessState>(DEFAULT_STATE);

function norm(v: any) {
  return String(v ?? "").trim();
}

export function AdminAccessProvider({
  children,
  menuAccess,
  isMainAdmin,
  isGeneralAdmin,
}: {
  children: React.ReactNode;

  // layout에서 주입
  menuAccess?: MenuAccessMap;
  isMainAdmin?: boolean;
  isGeneralAdmin?: boolean;
}) {
  const [state, setState] = useState<AdminAccessState>(() => ({
    ...DEFAULT_STATE,
    menuAccess: menuAccess ?? {},
    isMainAdmin: !!isMainAdmin,
    isGeneralAdmin: !!isGeneralAdmin,
    isAdmin: !!isMainAdmin || !!isGeneralAdmin,
  }));

  // ✅ layout에서 내려주는 값이 바뀌면 반영(훅 규칙 준수)
  useEffect(() => {
    setState((prev) => {
      const main = !!isMainAdmin;
      const general = !!isGeneralAdmin;
      return {
        ...prev,
        menuAccess: menuAccess ?? {},
        isMainAdmin: main,
        isGeneralAdmin: general,
        isAdmin: main || general,
      };
    });
  }, [menuAccess, isMainAdmin, isGeneralAdmin]);

  // ✅ 세션 정보는 Provider가 자체로도 유지(혹시 다른 곳에서 직접 쓸 때)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const sess = data.session;
        if (!sess) {
          if (!alive) return;
          setState((prev) => ({
            ...prev,
            loading: false,
            uid: "",
            email: "",
          }));
          return;
        }

        const uid = sess.user.id;
        const email = sess.user.email ?? "";

        // profiles (없어도 동작)
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, work_part, is_admin")
          .eq("id", uid)
          .maybeSingle();

        const hardMain = uid === ADMIN_UID || email === ADMIN_EMAIL;
        const dbMain = !!(prof as any)?.is_admin;
        const main = hardMain || dbMain;

        const general = norm((prof as any)?.work_part) === "관리자";

        if (!alive) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          uid,
          email,
          // layout에서 주는 값이 우선이지만, 최소한 true 유지
          isMainAdmin: prev.isMainAdmin || main,
          isGeneralAdmin: prev.isGeneralAdmin || (!main && general),
          isAdmin: prev.isAdmin || main || general,
        }));
      } catch {
        if (!alive) return;
        setState((prev) => ({ ...prev, loading: false }));
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminAccess() {
  return useContext(Ctx);
}