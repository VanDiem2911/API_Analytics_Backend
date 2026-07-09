import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const path = request.nextUrl.pathname;

  const origin = request.headers.get("origin") || "";
  const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:3000";

  if (path.startsWith("/api/track")) {
    response.headers.set("Access-Control-Allow-Origin", origin || "*");
  } else {
    const isAllowed =
      origin === allowedOrigin ||
      origin.includes("localhost") ||
      origin.includes("127.0.0.1") ||
      origin.endsWith(".vercel.app") ||
      !origin;

    if (isAllowed) {
      response.headers.set("Access-Control-Allow-Origin", origin);
    } else {
      response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
    }
  }

  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
  response.headers.set("Access-Control-Allow-Credentials", "true");

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 200, headers: response.headers });
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
