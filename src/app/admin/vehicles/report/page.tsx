"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VehiclePageScreen } from "../page";

function VehicleReportPageInner() {
  const searchParams = useSearchParams();
  const carNo = searchParams.get("carNo") ?? "";
  return <VehiclePageScreen initialTab="report" allowedTabs={["report"]} initialCarNo={carNo} />;
}

export default function VehicleReportPage() {
  return (
    <Suspense>
      <VehicleReportPageInner />
    </Suspense>
  );
}
