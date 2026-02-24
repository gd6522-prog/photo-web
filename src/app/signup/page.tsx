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
  const canVerify = !!lockedE164 && otp.trim().length >= 4 && !loading && otpSent;

  const hardSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
  };

  const onCheckPhone = async () => {
    if (!canCheckPhone) return;
    setCheckingPhone(true);

    try {
      if (!e164) throw new Error("전화번호 형식이 올바르지 않습니다.");

      const { data, error } = await supabase.rpc("check_phone_exists", { p_phone: e164 });
      if (error) throw error;

      const exists = !!data;
      setPhoneChecked(true);
      setPhoneExists(exists);
      setCheckedE164(e164);

      if (exists) {
        alert("이미 가입된 전화번호입니다. 로그인 페이지로 이동합니다.");
        router.replace("/login");
      } else {
        alert("가입 가능한 전화번호입니다. 계속 진행하세요.");
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
      if (!e164) throw new Error("전화번호 형식이 올바르지 않습니다.");
      if (!phoneChecked || phoneExists !== false || checkedE164 !== e164) {
        throw new Error("전화번호 확인을 먼저 진행해주세요.");
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
      alert("문자로 인증번호가 발송되었습니다.");
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

    try {
      const e164Fixed = lockedE164!;
      const birthdateDashed = birth8ToDash(birth8.trim());

      const { data: otpData, error: otpErr } = await supabase.auth.verifyOtp({
        phone: e164Fixed,
        token: otp.trim(),
        type: "sms",
      });
      if (otpErr) throw otpErr;

      const userId = otpData?.user?.id;
      if (!userId) throw new Error("OTP 인증은 됐는데 user id를 못 받았습니다.");

      // 비밀번호 설정 + 메타데이터 저장
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
      alert("가입 완료! 승인 대기 상태입니다. 승인되면 로그인 가능합니다.");
      router.replace("/login");
    } catch (e: any) {
      await hardSignOut();
      alert(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-6 flex items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-xl font-black text-zinc-900">회원가입</div>
        <div className="mt-1 text-sm text-zinc-500">
          가입 시 1회 문자 인증 후, 전화번호+비밀번호로 로그인합니다.
        </div>

        <div className="mt-5 grid gap-3">
          <input className="w-full rounded-xl border px-3 py-3 outline-none focus:ring" placeholder="이름"
            value={name} onChange={(e) => setName(e.target.value)} disabled={loading || otpSent} />

          <div className="flex gap-2">
            <input className="flex-1 rounded-xl border px-3 py-3 outline-none focus:ring" placeholder="전화번호 (01012345678)"
              value={phone} onChange={(e) => setPhone(e.target.value)} disabled={loading || otpSent || checkingPhone} />
            <button className="rounded-xl bg-black px-4 text-white font-bold disabled:opacity-60"
              onClick={onCheckPhone} disabled={!canCheckPhone}>
              {checkingPhone ? "확인중..." : "확인"}
            </button>
          </div>

          <input className="w-full rounded-xl border px-3 py-3 outline-none focus:ring" placeholder="생년월일 8자리 (YYYYMMDD)"
            value={birth8} onChange={(e) => setBirth8(e.target.value)} disabled={loading || otpSent} />

          <input className="w-full rounded-xl border px-3 py-3 outline-none focus:ring" placeholder="국적 (예: KR)"
            value={nationality} onChange={(e) => setNationality(e.target.value)} disabled={loading || otpSent} />

          <input className="w-full rounded-xl border px-3 py-3 outline-none focus:ring" placeholder="작업파트"
            value={workPart} onChange={(e) => setWorkPart(e.target.value)} disabled={loading || otpSent} />

          <input className="w-full rounded-xl border px-3 py-3 outline-none focus:ring" placeholder="비밀번호(6자리 이상)"
            type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading || otpSent} />
          <input className="w-full rounded-xl border px-3 py-3 outline-none focus:ring" placeholder="비밀번호 확인"
            type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} disabled={loading || otpSent} />

          {!otpSent ? (
            <button className="w-full rounded-xl bg-black py-3 font-bold text-white disabled:opacity-60"
              onClick={onSendOtp} disabled={!canSendOtp}>
              {loading ? "전송중..." : "인증번호 발송"}
            </button>
          ) : (
            <>
              <input className="w-full rounded-xl border px-3 py-3 outline-none focus:ring" placeholder="인증번호"
                value={otp} onChange={(e) => setOtp(e.target.value)} disabled={loading} />
              <button className="w-full rounded-xl bg-black py-3 font-bold text-white disabled:opacity-60"
                onClick={onVerify} disabled={!canVerify}>
                {loading ? "확인중..." : "인증 완료"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}