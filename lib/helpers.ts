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
  options?: { startDate?: string; endDate?: string }
): DateRangeResult {
  const now = new Date();
  
  let start = new Date(now);
  let end = new Date(now);
  
  let prevStart = new Date(now);
  let prevEnd = new Date(now);

  // Set start to beginning of day, end to end of day
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  switch (period) {
    case "today": {
      // Current: Today
      // Previous: Yesterday
      prevStart.setDate(start.getDate() - 1);
      prevStart.setHours(0, 0, 0, 0);
      
      prevEnd.setDate(end.getDate() - 1);
      prevEnd.setHours(23, 59, 59, 999);
      break;
    }
    case "yesterday": {
      // Current: Yesterday
      // Previous: Day before yesterday
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      
      prevStart.setDate(start.getDate() - 1);
      prevStart.setHours(0, 0, 0, 0);
      
      prevEnd.setDate(end.getDate() - 1);
      prevEnd.setHours(23, 59, 59, 999);
      break;
    }
    case "7days": {
      // Current: Last 7 Days
      // Previous: 7 Days before that
      start.setDate(start.getDate() - 6); // 7 days including today
      
      const dayLength = 7 * 24 * 60 * 60 * 1000;
      prevStart.setTime(start.getTime() - dayLength);
      prevEnd.setTime(end.getTime() - dayLength);
      break;
    }
    case "30days": {
      // Current: Last 30 Days
      // Previous: 30 Days before that
      start.setDate(start.getDate() - 29);
      
      const dayLength = 30 * 24 * 60 * 60 * 1000;
      prevStart.setTime(start.getTime() - dayLength);
      prevEnd.setTime(end.getTime() - dayLength);
      break;
    }
    case "month": {
      // Current: This Month (from 1st of month to now/end of month)
      start.setDate(1);
      
      // Previous: Last Month
      prevStart.setMonth(start.getMonth() - 1);
      prevStart.setDate(1);
      prevStart.setHours(0, 0, 0, 0);
      
      prevEnd.setTime(start.getTime() - 1); // Last millisecond of previous month
      break;
    }
    case "prev_month": {
      // Current: Last Month
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
      
      end.setDate(0); // Day 0 of this month is last day of previous month
      
      // Previous: Month before last month
      prevStart.setMonth(start.getMonth() - 1);
      prevStart.setDate(1);
      prevStart.setHours(0, 0, 0, 0);
      
      prevEnd.setTime(start.getTime() - 1);
      break;
    }
    case "year": {
      // Current: This Year
      start.setMonth(0, 1);
      
      // Previous: Last Year
      prevStart.setFullYear(start.getFullYear() - 1);
      prevStart.setMonth(0, 1);
      prevStart.setHours(0, 0, 0, 0);
      
      prevEnd.setTime(start.getTime() - 1);
      break;
    }
    case "prev_year": {
      // Current: Last Year
      start.setFullYear(start.getFullYear() - 1);
      start.setMonth(0, 1);
      
      end.setFullYear(end.getFullYear() - 1);
      end.setMonth(11, 31);
      
      // Previous: Year before last year
      prevStart.setFullYear(start.getFullYear() - 1);
      prevStart.setMonth(0, 1);
      prevStart.setHours(0, 0, 0, 0);
      
      prevEnd.setTime(start.getTime() - 1);
      break;
    }
    case "custom": {
      if (options?.startDate && options?.endDate) {
        start = new Date(options.startDate);
        start.setHours(0, 0, 0, 0);
        
        end = new Date(options.endDate);
        end.setHours(23, 59, 59, 999);
        
        const diffMs = end.getTime() - start.getTime() + 1;
        prevStart.setTime(start.getTime() - diffMs);
        prevEnd.setTime(end.getTime() - diffMs);
      } else {
        // Fallback to last 30 days if custom range is invalid/incomplete
        start.setDate(start.getDate() - 29);
        const dayLength = 30 * 24 * 60 * 60 * 1000;
        prevStart.setTime(start.getTime() - dayLength);
        prevEnd.setTime(end.getTime() - dayLength);
      }
      break;
    }
    default: {
      // Default: Last 30 Days
      start.setDate(start.getDate() - 29);
      const dayLength = 30 * 24 * 60 * 60 * 1000;
      prevStart.setTime(start.getTime() - dayLength);
      prevEnd.setTime(end.getTime() - dayLength);
      break;
    }
  }

  return { start, end, prevStart, prevEnd };
}
