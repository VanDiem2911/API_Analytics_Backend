import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { PageView } from "@/lib/models/PageView";
import { Session } from "@/lib/models/Session";
import { Visitor } from "@/lib/models/Visitor";
import { success, error, handleError, getDateRange } from "@/lib/helpers";
import { requireAuth } from "@/lib/auth";

async function resolveFilters(
  websiteId: string,
  searchParams: URLSearchParams,
  start: Date,
  end: Date
) {
  const browser = searchParams.get("browser");
  const device = searchParams.get("device");
  const country = searchParams.get("country");
  const page = searchParams.get("page");
  const campaign = searchParams.get("campaign");

  const pageViewFilter: any = {
    websiteId: new mongoose.Types.ObjectId(websiteId),
    timestamp: { $gte: start, $lte: end },
  };

  const sessionFilter: any = {
    websiteId: new mongoose.Types.ObjectId(websiteId),
    startedAt: { $gte: start, $lte: end },
  };

  if (page) {
    pageViewFilter.url = page;
    const sessionIds = await PageView.distinct("sessionId", {
      websiteId: new mongoose.Types.ObjectId(websiteId),
      timestamp: { $gte: start, $lte: end },
      url: page,
    });
    sessionFilter.sessionId = { $in: sessionIds };
  }

  if (campaign) {
    sessionFilter.utmCampaign = campaign;
    const sessionIds = await Session.distinct("sessionId", {
      websiteId: new mongoose.Types.ObjectId(websiteId),
      startedAt: { $gte: start, $lte: end },
      utmCampaign: campaign,
    });
    pageViewFilter.sessionId = { $in: sessionIds };
  }

  if (browser || device || country) {
    const visitorQuery: any = { websiteId: new mongoose.Types.ObjectId(websiteId) };
    if (browser) visitorQuery.browser = browser;
    if (device) visitorQuery.device = device;
    if (country) visitorQuery.country = country;

    const visitorIds = await Visitor.distinct("visitorId", visitorQuery);
    pageViewFilter.visitorId = { $in: visitorIds };
    sessionFilter.visitorId = { $in: visitorIds };
  }

  return { pageViewFilter, sessionFilter };
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    await connectDB();

    const { searchParams } = new URL(request.url);
    const websiteId = searchParams.get("websiteId");
    const period = searchParams.get("period") || "30days";
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    if (!websiteId) return error("websiteId là bắt buộc");

    const { start, end } = getDateRange(period, { startDate, endDate });
    const currentFilters = await resolveFilters(websiteId, searchParams, start, end);

    // Determine grouping step
    const diffMs = end.getTime() - start.getTime();
    const isHourly = diffMs <= 36 * 60 * 60 * 1000; // <= 36 hours
    const groupBy = isHourly ? "hour" : "day";

    // 1. Group PageViews
    const pageViewsData = await PageView.aggregate([
      { $match: currentFilters.pageViewFilter },
      {
        $group: {
          _id:
            groupBy === "hour"
              ? { $dateToString: { format: "%Y-%m-%d %H:00", date: "$timestamp" } }
              : { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          pageViews: { $sum: 1 },
          visitors: { $addToSet: "$visitorId" },
        },
      },
    ]);

    // 2. Group Sessions
    const sessionsData = await Session.aggregate([
      { $match: currentFilters.sessionFilter },
      {
        $group: {
          _id:
            groupBy === "hour"
              ? { $dateToString: { format: "%Y-%m-%d %H:00", date: "$startedAt" } }
              : { $dateToString: { format: "%Y-%m-%d", date: "$startedAt" } },
          sessions: { $sum: 1 },
        },
      },
    ]);

    // Map data for fast lookup
    const pvMap = new Map<string, { pageViews: number; visitors: number }>();
    pageViewsData.forEach((item) => {
      pvMap.set(item._id, {
        pageViews: item.pageViews,
        visitors: item.visitors.length,
      });
    });

    const sessMap = new Map<string, number>();
    sessionsData.forEach((item) => {
      sessMap.set(item._id, item.sessions);
    });

    // 3. Generate complete timeline buckets to guarantee no empty gaps
    const result: Array<{
      label: string;
      pageViews: number;
      visitors: number;
      sessions: number;
    }> = [];

    const temp = new Date(start);
    if (groupBy === "hour") {
      while (temp <= end) {
        const year = temp.getFullYear();
        const month = String(temp.getMonth() + 1).padStart(2, "0");
        const date = String(temp.getDate()).padStart(2, "0");
        const hour = String(temp.getHours()).padStart(2, "0");
        const key = `${year}-${month}-${date} ${hour}:00`;
        const displayLabel = `${hour}:00`;

        const pv = pvMap.get(key) || { pageViews: 0, visitors: 0 };
        const sessions = sessMap.get(key) || 0;

        result.push({
          label: displayLabel,
          pageViews: pv.pageViews,
          visitors: pv.visitors,
          sessions,
        });

        temp.setHours(temp.getHours() + 1);
      }
    } else {
      while (temp <= end) {
        const year = temp.getFullYear();
        const month = String(temp.getMonth() + 1).padStart(2, "0");
        const date = String(temp.getDate()).padStart(2, "0");
        const key = `${year}-${month}-${date}`;
        
        // Human readable display label, e.g. "Jul 08" or "08/07"
        const displayLabel = `${date}/${month}`;

        const pv = pvMap.get(key) || { pageViews: 0, visitors: 0 };
        const sessions = sessMap.get(key) || 0;

        result.push({
          label: displayLabel,
          pageViews: pv.pageViews,
          visitors: pv.visitors,
          sessions,
        });

        temp.setDate(temp.getDate() + 1);
      }
    }

    return success(result);
  } catch (err) {
    return handleError(err);
  }
}
