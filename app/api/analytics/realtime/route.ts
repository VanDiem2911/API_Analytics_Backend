import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { PageView } from "@/lib/models/PageView";
import { Event } from "@/lib/models/Event";
import { ErrorModel } from "@/lib/models/Error";
import { Heartbeat } from "@/lib/models/Heartbeat";
import { Visitor } from "@/lib/models/Visitor";
import { success, error, handleError } from "@/lib/helpers";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    await connectDB();

    const { searchParams } = new URL(request.url);
    const websiteId = searchParams.get("websiteId");

    if (!websiteId) return error("websiteId là bắt buộc");

    const wId = new mongoose.Types.ObjectId(websiteId);

    // 1. Get online count (heartbeats in last 60 seconds)
    const sixtySecondsAgo = new Date(Date.now() - 60000);
    const activeSessions = await Heartbeat.find({
      websiteId: wId,
      lastActive: { $gte: sixtySecondsAgo },
    });

    const onlineCount = activeSessions.length;
    const activeSessionIds = activeSessions.map((s) => s.sessionId);

    // 2. Active pages breakdown
    let activePages: Array<{ url: string; count: number }> = [];
    if (activeSessionIds.length > 0) {
      const activePagesAgg = await PageView.aggregate([
        { $match: { sessionId: { $in: activeSessionIds }, websiteId: wId } },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: "$sessionId",
            latestUrl: { $first: "$url" },
          },
        },
        {
          $group: {
            _id: "$latestUrl",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]);

      activePages = activePagesAgg.map((item) => ({
        url: item._id,
        count: item.count,
      }));
    }

    // 3. Realtime Activity Feed (Combine last 30 pageviews, 30 events, 20 errors)
    const [recentPageViews, recentEvents, recentErrors] = await Promise.all([
      PageView.find({ websiteId: wId }).sort({ timestamp: -1 }).limit(30).lean(),
      Event.find({ websiteId: wId }).sort({ timestamp: -1 }).limit(30).lean(),
      ErrorModel.find({ websiteId: wId }).sort({ timestamp: -1 }).limit(20).lean(),
    ]);

    // Format feed items
    const feedItems: any[] = [];

    recentPageViews.forEach((pv: any) => {
      feedItems.push({
        id: pv._id.toString(),
        type: "pageview",
        label: `Viewed page ${pv.url}`,
        description: pv.title || pv.url,
        url: pv.url,
        visitorId: pv.visitorId,
        timestamp: pv.timestamp,
      });
    });

    recentEvents.forEach((ev: any) => {
      feedItems.push({
        id: ev._id.toString(),
        type: "event",
        label: `Triggered event: ${ev.eventName}`,
        description: JSON.stringify(ev.eventData) === "{}" ? "" : JSON.stringify(ev.eventData),
        url: ev.url,
        visitorId: ev.visitorId,
        timestamp: ev.timestamp,
      });
    });

    recentErrors.forEach((err: any) => {
      feedItems.push({
        id: err._id.toString(),
        type: "error",
        label: `JS Error: ${err.message}`,
        description: err.stack ? err.stack.split("\n")[0] : "",
        url: err.url,
        visitorId: err.visitorId,
        timestamp: err.timestamp,
      });
    });

    // Sort combined feed and limit to top 50
    feedItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const topFeedItems = feedItems.slice(0, 50);

    // Decorate feed items with Visitor details (geolocation, browser, os, device)
    const visitorIds = Array.from(new Set(topFeedItems.map((item) => item.visitorId)));
    const visitors = await Visitor.find({
      websiteId: wId,
      visitorId: { $in: visitorIds },
    }).lean();

    const visitorMap = new Map<string, any>();
    visitors.forEach((v) => {
      visitorMap.set(v.visitorId, v);
    });

    const decoratedFeed = topFeedItems.map((item) => {
      const visitor = visitorMap.get(item.visitorId) || {};
      return {
        ...item,
        browser: visitor.browser || "Unknown",
        os: visitor.os || "Unknown",
        device: visitor.device || "desktop",
        country: visitor.country || "Vietnam",
        city: visitor.city || "Local",
      };
    });

    return success({
      onlineCount,
      activePages,
      feed: decoratedFeed,
    });
  } catch (err) {
    return handleError(err);
  }
}
