import { NextResponse } from "next/server";

export function success(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function error(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export function handleError(err: unknown) {
  console.error("[Global Error Handler]", err);
  if (err instanceof Error) {
    if (err.message === "UNAUTHORIZED") return error("Chưa đăng nhập", 401);
    if (err.message === "FORBIDDEN") return error("Không có quyền", 403);
    return error(err.message, 400);
  }
  return error("Lỗi server", 500);
}

// Utility to apply CORS headers on custom responses
export function addCorsHeaders(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization");
  return res;
}

export interface DateRangeResult {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
}

export function getDateRange(
  period: string,
  options?: { startDate?: string; endDate?: string; timezone?: string }
): DateRangeResult {
  const timeZone = options?.timezone || "Asia/Ho_Chi_Minh";
  
  // Calculate offset in minutes for target timezone
  let offsetMinutes = 420; // default to +7 hours for Asia/Ho_Chi_Minh
  try {
    const date = new Date();
    const utcFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hour12: false });
    const tzFormat = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hour12: false });
    const utcDate = new Date(utcFormat.format(date));
    const tzDate = new Date(tzFormat.format(date));
    offsetMinutes = Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
  } catch (e) {
    offsetMinutes = 420;
  }

  const nowUTC = Date.now();
  // Construct a Date object representing the time IN the target timezone
  const tzNow = new Date(nowUTC + offsetMinutes * 60000);
  
  let start = new Date(tzNow);
  let end = new Date(tzNow);
  
  let prevStart = new Date(tzNow);
  let prevEnd = new Date(tzNow);

  // Set start and end bounds in target timezone
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(23, 59, 59, 999);

  switch (period) {
    case "today": {
      prevStart.setUTCDate(start.getUTCDate() - 1);
      prevStart.setUTCHours(0, 0, 0, 0);
      
      prevEnd.setUTCDate(end.getUTCDate() - 1);
      prevEnd.setUTCHours(23, 59, 59, 999);
      break;
    }
    case "yesterday": {
      start.setUTCDate(start.getUTCDate() - 1);
      end.setUTCDate(end.getUTCDate() - 1);
      
      prevStart.setUTCDate(start.getUTCDate() - 1);
      prevStart.setUTCHours(0, 0, 0, 0);
      
      prevEnd.setUTCDate(end.getUTCDate() - 1);
      prevEnd.setUTCHours(23, 59, 59, 999);
      break;
    }
    case "7days": {
      start.setUTCDate(start.getUTCDate() - 6);
      
      const dayLength = 7 * 24 * 60 * 60 * 1000;
      prevStart.setTime(start.getTime() - dayLength);
      prevEnd.setTime(end.getTime() - dayLength);
      break;
    }
    case "30days": {
      start.setUTCDate(start.getUTCDate() - 29);
      
      const dayLength = 30 * 24 * 60 * 60 * 1000;
      prevStart.setTime(start.getTime() - dayLength);
      prevEnd.setTime(end.getTime() - dayLength);
      break;
    }
    case "month": {
      start.setUTCDate(1);
      
      prevStart.setUTCMonth(start.getUTCMonth() - 1);
      prevStart.setUTCDate(1);
      prevStart.setUTCHours(0, 0, 0, 0);
      
      prevEnd.setTime(start.getTime() - 1);
      break;
    }
    case "prev_month": {
      start.setUTCMonth(start.getUTCMonth() - 1);
      start.setUTCDate(1);
      
      end.setUTCDate(0);
      
      prevStart.setUTCMonth(start.getUTCMonth() - 1);
      prevStart.setUTCDate(1);
      prevStart.setUTCHours(0, 0, 0, 0);
      
      prevEnd.setTime(start.getTime() - 1);
      break;
    }
    case "year": {
      start.setUTCMonth(0, 1);
      
      prevStart.setUTCFullYear(start.getUTCFullYear() - 1);
      prevStart.setUTCMonth(0, 1);
      prevStart.setUTCHours(0, 0, 0, 0);
      
      prevEnd.setTime(start.getTime() - 1);
      break;
    }
    case "prev_year": {
      start.setUTCFullYear(start.getUTCFullYear() - 1);
      start.setUTCMonth(0, 1);
      
      end.setUTCFullYear(end.getUTCFullYear() - 1);
      end.setUTCMonth(11, 31);
      
      prevStart.setUTCFullYear(start.getUTCFullYear() - 1);
      prevStart.setUTCMonth(0, 1);
      prevStart.setUTCHours(0, 0, 0, 0);
      
      prevEnd.setTime(start.getTime() - 1);
      break;
    }
    case "custom": {
      if (options?.startDate && options?.endDate) {
        start = new Date(options.startDate);
        start.setUTCHours(0, 0, 0, 0);
        
        end = new Date(options.endDate);
        end.setUTCHours(23, 59, 59, 999);
        
        const diffMs = end.getTime() - start.getTime() + 1;
        prevStart.setTime(start.getTime() - diffMs);
        prevEnd.setTime(end.getTime() - diffMs);
      } else {
        start.setUTCDate(start.getUTCDate() - 29);
        const dayLength = 30 * 24 * 60 * 60 * 1000;
        prevStart.setTime(start.getTime() - dayLength);
        prevEnd.setTime(end.getTime() - dayLength);
      }
      break;
    }
    default: {
      start.setUTCDate(start.getUTCDate() - 29);
      const dayLength = 30 * 24 * 60 * 60 * 1000;
      prevStart.setTime(start.getTime() - dayLength);
      prevEnd.setTime(end.getTime() - dayLength);
      break;
    }
  }

  // Convert all computed bounds in target timezone back to true UTC Date objects for MongoDB queries
  const startUTC = new Date(start.getTime() - offsetMinutes * 60000);
  const endUTC = new Date(end.getTime() - offsetMinutes * 60000);
  const prevStartUTC = new Date(prevStart.getTime() - offsetMinutes * 60000);
  const prevEndUTC = new Date(prevEnd.getTime() - offsetMinutes * 60000);

  return { start: startUTC, end: endUTC, prevStart: prevStartUTC, prevEnd: prevEndUTC };
}
