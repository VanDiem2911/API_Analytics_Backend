import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { PageView } from "@/lib/models/PageView";
import { Session } from "@/lib/models/Session";
import { Visitor } from "@/lib/models/Visitor";
import { Heartbeat } from "@/lib/models/Heartbeat";
import { success, error, handleError, getDateRange } from "@/lib/helpers";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

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
    const timezone = searchParams.get("timezone") || "Asia/Ho_Chi_Minh";

    if (!websiteId) return error("websiteId là bắt buộc");

    // Get date ranges for current and previous period
    const { start, end, prevStart, prevEnd } = getDateRange(period, {
      startDate,
      endDate,
      timezone,
    });

    // Resolve filters for both current and previous ranges
    const currentFilters = await resolveFilters(websiteId, searchParams, start, end);
    const prevFilters = await resolveFilters(websiteId, searchParams, prevStart, prevEnd);

    // --- Execute current period metrics ---
    const pageViewsPromise = PageView.countDocuments(currentFilters.pageViewFilter);
    const visitorsPromise = PageView.distinct("visitorId", currentFilters.pageViewFilter);
    const sessionsPromise = Session.countDocuments(currentFilters.sessionFilter);

    // Bounce & duration require aggregation
    const bounceSessionPromise = Session.countDocuments({
      ...currentFilters.sessionFilter,
      bounce: true,
    });

    const avgDurationPromise = Session.aggregate([
      { $match: currentFilters.sessionFilter },
      { $group: { _id: null, avgDuration: { $avg: "$duration" } } },
    ]);

    // --- Execute previous period metrics ---
    const prevPageViewsPromise = PageView.countDocuments(prevFilters.pageViewFilter);
    const prevVisitorsPromise = PageView.distinct("visitorId", prevFilters.pageViewFilter);
    const prevSessionsPromise = Session.countDocuments(prevFilters.sessionFilter);
    
    const prevBounceSessionPromise = Session.countDocuments({
      ...prevFilters.sessionFilter,
      bounce: true,
    });

    const prevAvgDurationPromise = Session.aggregate([
      { $match: prevFilters.sessionFilter },
      { $group: { _id: null, avgDuration: { $avg: "$duration" } } },
    ]);

    // Wait for all promises
    const [
      pageViews,
      visitorsList,
      sessions,
      bounceSessions,
      avgDurationResult,
      prevPageViews,
      prevVisitorsList,
      prevSessions,
      prevBounceSessions,
      prevAvgDurationResult,
    ] = await Promise.all([
      pageViewsPromise,
      visitorsPromise,
      sessionsPromise,
      bounceSessionPromise,
      avgDurationPromise,
      prevPageViewsPromise,
      prevVisitorsPromise,
      prevSessionsPromise,
      prevBounceSessionPromise,
      prevAvgDurationPromise,
    ]);

    const visitors = visitorsList.length;
    const prevVisitors = prevVisitorsList.length;

    // Bounce rates
    const bounceRate = sessions > 0 ? (bounceSessions / sessions) * 100 : 0;
    const prevBounceRate = prevSessions > 0 ? (prevBounceSessions / prevSessions) * 100 : 0;

    // Avg Durations
    const avgDuration = avgDurationResult[0]?.avgDuration || 0;
    const prevAvgDuration = prevAvgDurationResult[0]?.avgDuration || 0;

    // Realtime visitors count: active in last 60 seconds
    const sixtySecondsAgo = new Date(Date.now() - 60000);
    const onlineVisitorsCount = await Heartbeat.countDocuments({
      websiteId: new mongoose.Types.ObjectId(websiteId),
      lastActive: { $gte: sixtySecondsAgo },
    });

    // Helper to calculate percentage change
    const calcChange = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
    };

    return success({
      current: {
        pageViews,
        visitors,
        sessions,
        bounceRate: parseFloat(bounceRate.toFixed(1)),
        avgDuration: Math.round(avgDuration),
        online: onlineVisitorsCount,
      },
      previous: {
        pageViews: prevPageViews,
        visitors: prevVisitors,
        sessions: prevSessions,
        bounceRate: parseFloat(prevBounceRate.toFixed(1)),
        avgDuration: Math.round(prevAvgDuration),
      },
      change: {
        pageViews: calcChange(pageViews, prevPageViews),
        visitors: calcChange(visitors, prevVisitors),
        sessions: calcChange(sessions, prevSessions),
        bounceRate: parseFloat((bounceRate - prevBounceRate).toFixed(1)), // bounce rate diff is better as absolute points diff
        avgDuration: calcChange(avgDuration, prevAvgDuration),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
