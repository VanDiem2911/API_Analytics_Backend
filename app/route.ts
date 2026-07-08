import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "online",
    message: "KPI Website Analytics API is running successfully.",
    version: "1.0.0",
  });
}
