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

function describeHttpHealth(statusCode: number, configured: boolean) {
  const targetName = configured ? "Backend" : "Website";

  if (statusCode >= 200 && statusCode < 400) {
    return {
      status: "online" as const,
      message: `${targetName} đang phản hồi bình thường`,
    };
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      status: "online" as const,
      message: `${targetName} có phản hồi nhưng endpoint đang yêu cầu đăng nhập/quyền truy cập (HTTP ${statusCode}). Nếu muốn kiểm tra chuẩn hơn, hãy dùng URL /health công khai.`,
    };
  }

  if (statusCode === 404) {
    return {
      status: "offline" as const,
      message: `Không tìm thấy endpoint kiểm tra ${configured ? "backend" : "website"} (404). Kiểm tra lại URL health check, ví dụ /health hoặc /api/health.`,
    };
  }

  if (statusCode >= 400 && statusCode < 500) {
    return {
      status: "offline" as const,
      message: `${targetName} có phản hồi nhưng từ chối yêu cầu kiểm tra (HTTP ${statusCode}). Kiểm tra lại URL health check hoặc quyền truy cập.`,
    };
  }

  if (statusCode >= 500) {
    return {
      status: "offline" as const,
      message: `${targetName} đang lỗi phía máy chủ (HTTP ${statusCode}). Mở log backend để xem lỗi chi tiết.`,
    };
  }

  return {
    status: "offline" as const,
    message: `${targetName} phản hồi không hợp lệ (HTTP ${statusCode}). Kiểm tra lại cấu hình health check.`,
  };
}

function describeConnectionFailure(fetchError: unknown, configured: boolean) {
  const targetName = configured ? "backend" : "website";
  const code =
    (fetchError as { cause?: { code?: string }; code?: string })?.cause?.code ||
    (fetchError as { code?: string })?.code;

  if (fetchError instanceof Error && fetchError.name === "AbortError") {
    return `Không thể kết nối ${targetName}: máy chủ không phản hồi sau 8 giây. Có thể service đang sleep hoặc đã tắt.`;
  }

  if (code === "ENOTFOUND") {
    return `Không thể kết nối ${targetName}: không tìm thấy domain. Kiểm tra lại URL health check.`;
  }

  if (code === "ECONNREFUSED") {
    return `Không thể kết nối ${targetName}: máy chủ từ chối kết nối. Backend có thể đang tắt hoặc chưa mở cổng public.`;
  }

  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return `Không thể kết nối ${targetName}: kết nối bị quá thời gian. Backend có thể đang ngủ, quá tải hoặc mạng không ổn định.`;
  }

  if (code === "CERT_HAS_EXPIRED" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
    return `Không thể kết nối ${targetName}: chứng chỉ HTTPS không hợp lệ. Kiểm tra lại SSL/domain.`;
  }

  return `Không thể kết nối ${targetName}. Có thể backend đã tắt, sai domain hoặc máy chủ đang gặp lỗi mạng.`;
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

      const configured = Boolean(configuredUrl);
      const health = describeHttpHealth(response.status, configured);

      return success({
        status: health.status,
        statusCode: response.status,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        url: target.toString(),
        configured,
        message: health.message,
      });
    } catch (fetchError) {
      const configured = Boolean(configuredUrl);

      return success({
        status: "offline",
        statusCode: null,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        url: target.toString(),
        configured,
        message: describeConnectionFailure(fetchError, configured),
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    return handleError(err);
  }
}
