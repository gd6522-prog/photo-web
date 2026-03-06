import { NextResponse } from "next/server";

/**
 * 경기도 화성시 양감면(Yanggam-myeon) 기준 (고정)
 * 37.085833, 126.959722
 */
const LAT = 37.085833;
const LON = 126.959722;

function weatherTextFromCode(code: number | null | undefined) {
  if (code == null) return "정보 없음";
  if (code === 0) return "맑음";
  if (code === 1 || code === 2) return "대체로 맑음";
  if (code === 3) return "흐림";
  if (code === 45 || code === 48) return "안개";
  if (code >= 51 && code <= 57) return "이슬비";
  if (code >= 61 && code <= 67) return "비";
  if (code >= 71 && code <= 77) return "눈";
  if (code >= 80 && code <= 82) return "소나기";
  if (code >= 85 && code <= 86) return "눈 소나기";
  if (code >= 95) return "천둥번개";
  return `날씨 코드 ${code}`;
}

function dowKo(dateYMD: string) {
  const d = new Date(`${dateYMD}T00:00:00+09:00`);
  const map = ["일", "월", "화", "수", "목", "금", "토"];
  return map[d.getDay()] ?? "";
}

function toNum(v: any): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function GET() {
  try {
    // 1) 날씨 (Open-Meteo forecast)
    const weatherUrl =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${LAT}` +
      `&longitude=${LON}` +
      `&timezone=Asia%2FSeoul` +
      `&current=temperature_2m,apparent_temperature,weather_code` +
      `&hourly=precipitation_probability` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code`;

    const wRes = await fetch(weatherUrl, { cache: "no-store" });
    if (!wRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          locationName: "경기도 화성시 양감면",
          updatedAt: null,
          today: {
            date: "",
            currentTemp: null,
            feelsLike: null,
            weatherCode: null,
            weatherText: "불러오기 실패",
            precipProbNow: null,
            max: null,
            min: null,
            pm10: null,
            pm25: null,
          },
          next7: [],
          message: `Weather API error: ${wRes.status}`,
        },
        { status: 200 }
      );
    }
    const w = await wRes.json();

    // 2) 미세먼지 (Open-Meteo air-quality)
    const airUrl =
      "https://air-quality-api.open-meteo.com/v1/air-quality" +
      `?latitude=${LAT}` +
      `&longitude=${LON}` +
      `&timezone=Asia%2FSeoul` +
      `&hourly=pm10,pm2_5`;

    const aRes = await fetch(airUrl, { cache: "no-store" });
    let air: any = null;
    if (aRes.ok) air = await aRes.json();

    const nowISO = new Date().toISOString();

    // daily arrays
    const dailyTime: string[] = w?.daily?.time ?? [];
    const tMax: any[] = w?.daily?.temperature_2m_max ?? [];
    const tMin: any[] = w?.daily?.temperature_2m_min ?? [];
    const pMax: any[] = w?.daily?.precipitation_probability_max ?? [];
    const dCode: any[] = w?.daily?.weather_code ?? [];

    // today is index 0
    const todayDate = dailyTime?.[0] ?? "";
    const todayMax = toNum(tMax?.[0]);
    const todayMin = toNum(tMin?.[0]);
    const todayDailyCode = toNum(dCode?.[0]);

    // current
    const currentTemp = toNum(w?.current?.temperature_2m);
    const feelsLike = toNum(w?.current?.apparent_temperature);
    const currentCode = toNum(w?.current?.weather_code);

    // precip prob "now" from hourly
    const hourlyTime: string[] = w?.hourly?.time ?? [];
    const hourlyP: any[] = w?.hourly?.precipitation_probability ?? [];

    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const d = String(kst.getUTCDate()).padStart(2, "0");
    const hh = String(kst.getUTCHours()).padStart(2, "0");
    const key = `${y}-${m}-${d}T${hh}:00`;

    let precipProbNow: number | null = null;
    const idxNow = hourlyTime.indexOf(key);
    if (idxNow >= 0) precipProbNow = toNum(hourlyP[idxNow]);

    // air quality now
    let pm10: number | null = null;
    let pm25: number | null = null;
    const airTime: string[] = air?.hourly?.time ?? [];
    const airPm10: any[] = air?.hourly?.pm10 ?? [];
    const airPm25: any[] = air?.hourly?.pm2_5 ?? [];
    const airIdx = airTime.indexOf(key);
    if (airIdx >= 0) {
      pm10 = toNum(airPm10[airIdx]);
      pm25 = toNum(airPm25[airIdx]);
    }

    // D+7 (오늘 제외): index 1..7 => 7개
    const next7 = [];
    for (let i = 1; i <= 7; i++) {
      const date = dailyTime?.[i];
      if (!date) continue;
      const code = toNum(dCode?.[i]);
      next7.push({
        date,
        dow: dowKo(date),
        precipProbMax: toNum(pMax?.[i]),
        max: toNum(tMax?.[i]),
        min: toNum(tMin?.[i]),
        weatherCode: code,
        weatherText: weatherTextFromCode(code),
      });
    }

    return NextResponse.json(
      {
        ok: true,
        locationName: "경기도 화성시 양감면",
        updatedAt: nowISO,
        today: {
          date: todayDate,
          currentTemp,
          feelsLike,
          weatherCode: currentCode ?? todayDailyCode,
          weatherText: weatherTextFromCode(currentCode ?? todayDailyCode),
          precipProbNow,
          max: todayMax,
          min: todayMin,
          pm10,
          pm25,
        },
        next7,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        locationName: "경기도 화성시 양감면",
        updatedAt: null,
        today: {
          date: "",
          currentTemp: null,
          feelsLike: null,
          weatherCode: null,
          weatherText: "불러오기 실패",
          precipProbNow: null,
          max: null,
          min: null,
          pm10: null,
          pm25: null,
        },
        next7: [],
        message: e?.message ?? String(e),
      },
      { status: 200 }
    );
  }
}
