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

    // 1. Fetch active visitors during the timeframe to join visitor metadata
    const activeVisitorIds = await PageView.distinct(
      "visitorId",
      currentFilters.pageViewFilter
    );

    // --- Core Aggregations ---
    
    // Top Pages
    const pagesPromise = PageView.aggregate([
      { $match: currentFilters.pageViewFilter },
      { $group: { _id: "$url", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]);

    // Top Referrers
    const referrersPromise = Session.aggregate([
      { $match: currentFilters.sessionFilter },
      { $group: { _id: "$referrerDomain", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]);

    // Top Campaigns
    const campaignsPromise = Session.aggregate([
      {
        $match: {
          ...currentFilters.sessionFilter,
          utmCampaign: { $ne: "" },
        },
      },
      { $group: { _id: "$utmCampaign", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]);

    // Device breakdown
    const devicesPromise = Visitor.aggregate([
      {
        $match: {
          websiteId: new mongoose.Types.ObjectId(websiteId),
          visitorId: { $in: activeVisitorIds },
        },
      },
      { $group: { _id: "$device", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Browser breakdown
    const browsersPromise = Visitor.aggregate([
      {
        $match: {
          websiteId: new mongoose.Types.ObjectId(websiteId),
          visitorId: { $in: activeVisitorIds },
        },
      },
      { $group: { _id: "$browser", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Operating System breakdown
    const osPromise = Visitor.aggregate([
      {
        $match: {
          websiteId: new mongoose.Types.ObjectId(websiteId),
          visitorId: { $in: activeVisitorIds },
        },
      },
      { $group: { _id: "$os", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Country breakdown
    const countriesPromise = Visitor.aggregate([
      {
        $match: {
          websiteId: new mongoose.Types.ObjectId(websiteId),
          visitorId: { $in: activeVisitorIds },
        },
      },
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]);

    // City breakdown
    const citiesPromise = Visitor.aggregate([
      {
        $match: {
          websiteId: new mongoose.Types.ObjectId(websiteId),
          visitorId: { $in: activeVisitorIds },
        },
      },
      { $group: { _id: "$city", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]);

    // Wait for all aggregations to complete
    const [
      pages,
      referrers,
      campaigns,
      devices,
      browsers,
      os,
      countries,
      cities,
    ] = await Promise.all([
      pagesPromise,
      referrersPromise,
      campaignsPromise,
      devicesPromise,
      browsersPromise,
      osPromise,
      countriesPromise,
      citiesPromise,
    ]);

    // Helper formatter to return an array of { name, count }
    const formatBreakdown = (arr: any[]) =>
      arr.map((item) => ({
        name: item._id || "Direct/Unknown",
        count: item.count,
      }));

    return success({
      pages: formatBreakdown(pages),
      referrers: formatBreakdown(referrers),
      campaigns: formatBreakdown(campaigns),
      devices: formatBreakdown(devices),
      browsers: formatBreakdown(browsers),
      os: formatBreakdown(os),
      countries: formatBreakdown(countries),
      cities: formatBreakdown(cities),
    });
  } catch (err) {
    return handleError(err);
  }
}
