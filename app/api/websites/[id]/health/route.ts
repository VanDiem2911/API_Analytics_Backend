import { lookup } from "dns/promises";
import { isIP } from "net";
import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { Website } from "@/lib/models/Website";
import { error, handleError, success } from "@/lib/helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isPrivateAddress(address: string): boolean {
  if (address === "::" || address === "::1" || address === "0.0.0.0") return true;

  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mappedIpv4) return isPrivateAddress(mappedIpv4);

    return (
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return true;

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

async function validatePublicUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("URL health check không hợp lệ");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("URL health check chỉ hỗ trợ HTTP hoặc HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("URL health check không được chứa thông tin đăng nhập");
  }
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new Error("URL health check chỉ hỗ trợ cổng 80 hoặc 443");
  }

  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true });

  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("URL health check phải trỏ tới máy chủ công khai");
  }

  return url;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request);
    await connectDB();

    const website = await Website.findById(params.id);
    if (!website) return error("Không tìm thấy website", 404);
    if (user.role !== "ADMIN" && website.owner.toString() !== user._id.toString()) {
      return error("Không có quyền kiểm tra website này", 403);
    }

    const configuredUrl = website.healthCheckUrl?.trim();
    const target = await validatePublicUrl(configuredUrl || `https://${website.domain}`);
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(target, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "User-Agent": "DUDI-Analytics-HealthCheck/1.0",
          Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        },
      });

      return success({
        status: response.status < 500 ? "online" : "offline",
        statusCode: response.status,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        url: target.toString(),
        configured: Boolean(configuredUrl),
        message:
          response.status < 500
            ? "Website đang phản hồi"
            : `Máy chủ trả về HTTP ${response.status}`,
      });
    } catch (fetchError) {
      const timedOut =
        fetchError instanceof Error && fetchError.name === "AbortError";

      return success({
        status: "offline",
        statusCode: null,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        url: target.toString(),
        configured: Boolean(configuredUrl),
        message: timedOut
          ? "Không phản hồi sau 8 giây"
          : "Không thể kết nối tới website",
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    return handleError(err);
  }
}
