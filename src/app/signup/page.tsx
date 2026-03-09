"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

function toE164KR(raw: string): string | null {
  const s = raw.replace(/[^\d+]/g, "");
  if (s.startsWith("+")) {
    if (!/^\+\d{8,15}$/.test(s)) return null;
    return s;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 11) return null;
  if (!digits.startsWith("0")) return null;
  return `+82${digits.slice(1)}`;
}

function isValidBirth8(v: string) {
  if (!/^\d{8}$/.test(v)) return false;
  const y = Number(v.slice(0, 4));
  const m = Number(v.slice(4, 6));
  const d = Number(v.slice(6, 8));
  if (y < 1900 || y > 2100) return false;
  if (m < 1 || m > 12) return false;
  const dt = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d;
}

function birth8ToDash(v: string) {
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birth8, setBirth8] = useState("");
  const [nationality, setNationality] = useState("KR");
  const [workPart, setWorkPart] = useState("");

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [lockedE164, setLockedE164] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [checkingPhone, setCheckingPhone] = useState(false);

  const [phoneChecked, setPhoneChecked] = useState(false);
  const [phoneExists, setPhoneExists] = useState<boolean | null>(null);
  const [checkedE164, setCheckedE164] = useState<string | null>(null);

  const e164 = useMemo(() => toE164KR(phone.trim()), [phone]);
  const birthOk = useMemo(() => isValidBirth8(birth8.trim()), [birth8]);

  const passOk = useMemo(() => {
    const p = password.trim();
    const p2 = password2.trim();
    return p.length >= 6 && p === p2;
  }, [password, password2]);

  const baseFormOk = useMemo(() => {
    return (
      name.trim().length >= 2 &&
      !!e164 &&
      passOk &&
      birthOk &&
      nationality.trim().length > 0 &&
      workPart.trim().length > 0
    );
  }, [name, e164, passOk, birthOk, nationality, workPart]);

  const formOk = useMemo(() => {
    return baseFormOk && phoneChecked && phoneExists === false && checkedE164 === e164;
  }, [baseFormOk, phoneChecked, phoneExists, checkedE164, e164]);

  const canCheckPhone = !!e164 && !loading && !otpSent && !checkingPhone;
  const canSendOtp = formOk && !loading && !otpSent;
  const canVerify = formOk && !!lockedE164 && otp.trim().length >= 4 && !loading && otpSent;

  const hardSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
  };

  const cleanupIncompleteSignup = async (accessToken?: string | null) => {
    const token = String(accessToken ?? "").trim();
    if (!token) return;

    try {
      await fetch("/api/signup/cleanup-incomplete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {}
  };

  const onCheckPhone = async () => {
    if (!canCheckPhone) return;
    setCheckingPhone(true);

    try {
      if (!e164) throw new Error("?袁れ넅甕곕뜇???類ㅻ뻼????而?몴?? ??녿뮸??덈뼄.");

      const { data, error } = await supabase.rpc("check_phone_exists", { p_phone: e164 });
      if (error) throw error;

      const exists = !!data;
      setPhoneChecked(true);
      setPhoneExists(exists);
      setCheckedE164(e164);

      if (exists) {
        alert("??? 揶쎛??낅쭆 ?袁れ넅甕곕뜇???낅빍?? 嚥≪뮄?????륁뵠筌왖嚥???猷??몃빍??");
        router.replace("/login");
      } else {
        alert("揶쎛??揶쎛?館釉??袁れ넅甕곕뜇???낅빍?? ?④쑴??筌욊쑵六??뤾쉭??");
      }
    } catch (e: any) {
      setPhoneChecked(false);
      setPhoneExists(null);
      setCheckedE164(null);
      alert(e?.message ?? String(e));
    } finally {
      setCheckingPhone(false);
    }
  };

  const onSendOtp = async () => {
    if (!canSendOtp) return;
    setLoading(true);

    try {
      if (!e164) throw new Error("?袁れ넅甕곕뜇???類ㅻ뻼????而?몴?? ??녿뮸??덈뼄.");
      if (!phoneChecked || phoneExists !== false || checkedE164 !== e164) {
        throw new Error("?袁れ넅甕곕뜇???類ㅼ뵥???믪눘? 筌욊쑵六??곻폒?紐꾩뒄.");
      }

      const birthdateDashed = birth8ToDash(birth8.trim());

      const { error } = await supabase.auth.signInWithOtp({
        phone: e164,
        options: {
          data: {
            name: name.trim(),
            work_part: workPart.trim(),
            phone: e164,
            phone_verified: false,
            birthdate: birthdateDashed,
            nationality: nationality.trim(),
            language: "ko",
          },
        },
      });

      if (error) throw error;

      setLockedE164(e164);
      setOtpSent(true);
      alert("?얜챷?꾣에??紐꾩쵄甕곕뜇?뉐첎? 獄쏆뮇???뤿???щ빍??");
    } catch (e: any) {
      setLockedE164(null);
      setOtpSent(false);
      setOtp("");
      alert(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async () => {
    if (!canVerify) return;
    setLoading(true);
    let cleanupToken = "";

    try {
      const e164Fixed = lockedE164!;
      if (name.trim().length < 2) throw new Error("???藥??2?リ섣?????怨대쭜 ???놁졑???낅슣?섋땻??");
      if (!birthOk) throw new Error("??紐꺜??븐슦逾?8???遊???筌먐쇰꼪?????놁졑???낅슣?섋땻??");
      if (!workPart.trim()) throw new Error("??얜????怨뺣콦?????놁졑???낅슣?섋땻??");
      if (!passOk) throw new Error("?????뺢퀡???믩ご????곕뻣 ?筌먦끉逾???낅슣?섋땻??");
      const birthdateDashed = birth8ToDash(birth8.trim());

      const { data: otpData, error: otpErr } = await supabase.auth.verifyOtp({
        phone: e164Fixed,
        token: otp.trim(),
        type: "sms",
      });
      if (otpErr) throw otpErr;

      const userId = otpData?.user?.id;
      cleanupToken = String(otpData?.session?.access_token ?? "");
      if (!userId) throw new Error("OTP ?紐꾩쵄?? ?癒?뮉??user id??筌?獄쏆룇釉??щ빍??");

      // ??쑬?甕곕뜇????쇱젟 + 筌롫???怨쀬뵠??????
      const { error: upErr } = await supabase.auth.updateUser({
        password: password.trim(),
        data: {
          name: name.trim(),
          work_part: workPart.trim(),
          phone: e164Fixed,
          phone_verified: true,
          birthdate: birthdateDashed,
          nationality: nationality.trim(),
          language: "ko",
        },
      });
      if (upErr) throw upErr;

      // profiles upsert
      const { error: profErr } = await supabase.from("profiles").upsert(
        {
          id: userId,
          phone: e164Fixed,
          name: name.trim(),
          work_part: workPart.trim(),
          birthdate: birthdateDashed,
          nationality: nationality.trim(),
          language: "ko",
          phone_verified: true,
        },
        { onConflict: "id" }
      );
      if (profErr) throw profErr;

      await hardSignOut();
      alert("揶쎛???袁⑥┷! ?諭????疫??怨밴묶??낅빍?? ?諭???롢늺 嚥≪뮄???揶쎛?館鍮??덈뼄.");
      router.replace("/login");
    } catch (e: any) {
      await cleanupIncompleteSignup(cleanupToken);
      await hardSignOut();
      alert(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#ecf2f7] p-6 flex items-center justify-center">
      <div className="pointer-events-none absolute -top-28 -left-24 h-80 w-80 rounded-full bg-[#0f766e]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-[#164e63]/20 blur-3xl" />
      <div className="w-full max-w-lg rounded-3xl border border-[#b6c8d7] bg-white/95 p-6 shadow-[0_24px_60px_rgba(2,32,46,0.18)]">
        <div className="text-xl font-black text-[#0b2536]">회원가입</div>
        <div className="mt-1 text-sm text-[#557186]">
          가입은 1회 문자 인증 후 전화번호와 비밀번호로 로그인합니다.
        </div>

        <div className="mt-5 grid gap-3">
          <input className="w-full rounded-xl border border-[#b7c8d7] px-3 py-3 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" placeholder="이름"
            value={name} onChange={(e) => setName(e.target.value)} disabled={loading || otpSent} />

          <div className="flex gap-2">
            <input className="flex-1 rounded-xl border border-[#b7c8d7] px-3 py-3 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" placeholder="?袁れ넅甕곕뜇??(01012345678)"
              value={phone} onChange={(e) => setPhone(e.target.value)} disabled={loading || otpSent || checkingPhone} />
            <button className="rounded-xl bg-[#103b53] px-4 text-white font-bold transition hover:bg-[#0c2f43] disabled:opacity-60"
              onClick={onCheckPhone} disabled={!canCheckPhone}>
              {checkingPhone ? "?類ㅼ뵥餓?.." : "?類ㅼ뵥"}
            </button>
          </div>

          <input className="w-full rounded-xl border border-[#b7c8d7] px-3 py-3 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" placeholder="??몃?遺우뵬 8?癒?봺 (YYYYMMDD)"
            value={birth8} onChange={(e) => setBirth8(e.target.value)} disabled={loading || otpSent} />

          <input className="w-full rounded-xl border border-[#b7c8d7] px-3 py-3 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" placeholder="????(?? KR)"
            value={nationality} onChange={(e) => setNationality(e.target.value)} disabled={loading || otpSent} />

          <input className="w-full rounded-xl border border-[#b7c8d7] px-3 py-3 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" placeholder="?臾믩씜??곕뱜"
            value={workPart} onChange={(e) => setWorkPart(e.target.value)} disabled={loading || otpSent} />

          <input className="w-full rounded-xl border border-[#b7c8d7] px-3 py-3 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" placeholder="??쑬?甕곕뜇??6?癒?봺 ??곴맒)"
            type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading || otpSent} />
          <input className="w-full rounded-xl border border-[#b7c8d7] px-3 py-3 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" placeholder="??쑬?甕곕뜇???類ㅼ뵥"
            type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} disabled={loading || otpSent} />

          {!otpSent ? (
            <button className="w-full rounded-xl bg-[#103b53] py-3 font-bold text-white transition hover:bg-[#0c2f43] disabled:opacity-60"
              onClick={onSendOtp} disabled={!canSendOtp}>
              {loading ? "전송중.." : "인증번호 발송"}
            </button>
          ) : (
            <>
              <input className="w-full rounded-xl border border-[#b7c8d7] px-3 py-3 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" placeholder="인증번호"
                value={otp} onChange={(e) => setOtp(e.target.value)} disabled={loading} />
              <button className="w-full rounded-xl bg-[#103b53] py-3 font-bold text-white transition hover:bg-[#0c2f43] disabled:opacity-60"
                onClick={onVerify} disabled={!canVerify}>
                {loading ? "?類ㅼ뵥餓?.." : "?紐꾩쵄 ?袁⑥┷"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
