"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VehiclePageScreen } from "../page";

function VehicleReportPageInner() {
  const searchParams = useSearchParams();
  const carNo = searchParams.get("carNo") ?? "";
  const supportAuto = searchParams.get("supportAuto") === "1";
  return <VehiclePageScreen initialTab="report" allowedTabs={["report"]} initialCarNo={carNo} initialSupportAuto={supportAuto} />;
}

export default function VehicleReportPage() {
  return (
    <Suspense>
      <VehicleReportPageInner />
    </Suspense>
  );
}
