"use client";

import { VehiclePageScreen } from "../vehicles/page";

export default function OperationPage() {
  return <VehiclePageScreen initialTab="input" allowedTabs={["input"]} />;
}
