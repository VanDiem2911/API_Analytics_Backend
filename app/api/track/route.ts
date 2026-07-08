import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Website } from "@/lib/models/Website";
import { Visitor } from "@/lib/models/Visitor";
import { Session } from "@/lib/models/Session";
import { PageView } from "@/lib/models/PageView";
import { Event } from "@/lib/models/Event";
import { Performance } from "@/lib/models/Performance";
import { ErrorModel } from "@/lib/models/Error";
import { Heartbeat } from "@/lib/models/Heartbeat";
import { success, error, handleError } from "@/lib/helpers";

function getReferrerDomain(referrer: string): string {
  if (!referrer) return "Direct";
  try {
    const url = new URL(referrer);
    const domain = url.hostname.replace(/^www\./, "");
    if (domain.includes("google")) return "Google";
    if (domain.includes("facebook")) return "Facebook";
    if (domain.includes("instagram")) return "Instagram";
    if (domain.includes("youtube")) return "YouTube";
    if (domain.includes("tiktok")) return "TikTok";
    if (domain.includes("twitter") || domain.includes("x.com")) return "Twitter/X";
    if (domain.includes("github")) return "GitHub";
    if (domain.includes("linkedin")) return "LinkedIn";
    return domain;
  } catch (e) {
    return "Referral";
  }
}

// Simple IP to country mock helper
function getCountryAndCity(request: NextRequest): { country: string; city: string } {
  // Check common proxy headers for location
  const cfCountry = request.headers.get("cf-ipcountry");
  if (cfCountry) {
    // If running behind cloudflare
    const nameMap: Record<string, string> = {
      VN: "Vietnam",
      US: "United States",
      SG: "Singapore",
      JP: "Japan",
      KR: "South Korea",
    };
    return {
      country: nameMap[cfCountry.toUpperCase()] || cfCountry,
      city: request.headers.get("cf-ipcity") || "Unknown City",
    };
  }

  // Fallback default
  return {
    country: "Vietnam",
    city: "Ho Chi Minh City",
  };
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const { apiKey, type, visitorId, sessionId, data } = body;

    if (!apiKey) return error("API Key là bắt buộc");
    if (!type || !visitorId || !sessionId) return error("Dữ liệu không đầy đủ");

    // Authenticate the website API Key
    const website = await Website.findOne({ apiKey, status: "active" });
    if (!website) return error("API Key không hợp lệ hoặc website đã bị vô hiệu hóa", 401);

    const websiteId = website._id;

    switch (type) {
      case "pageview": {
        const {
          url,
          previousUrl,
          title,
          browser,
          browserVersion,
          device,
          os,
          language,
          timezone,
          screenWidth,
          screenHeight,
          referrer,
          utmSource,
          utmMedium,
          utmCampaign,
        } = data;

        const screenResolution = `${screenWidth || 0}x${screenHeight || 0}`;
        const { country, city } = getCountryAndCity(request);

        // 1. Update/Create Visitor record
        await Visitor.findOneAndUpdate(
          { visitorId, websiteId },
          {
            lastSeen: new Date(),
            browser,
            os,
            device,
            language,
            timezone,
            country,
            city,
            screenResolution,
          },
          { upsert: true, new: true }
        );

        // 2. Update/Create Session record
        const referrerDomain = getReferrerDomain(referrer);
        const session = await Session.findOne({ sessionId, websiteId });

        if (!session) {
          // If first pageview in session, create new session
          await Session.create({
            sessionId,
            visitorId,
            websiteId,
            startedAt: new Date(),
            endedAt: new Date(),
            referrer,
            referrerDomain,
            utmSource,
            utmMedium,
            utmCampaign,
            duration: 0,
            bounce: true, // starts as true, changes to false on 2nd pageview or event
          });
        } else {
          // Existing session, update end time and mark bounce = false
          session.endedAt = new Date();
          session.bounce = false;
          await session.save();
        }

        // 3. Create PageView record
        await PageView.create({
          sessionId,
          visitorId,
          websiteId,
          url,
          title,
          referrer,
          timestamp: new Date(),
          duration: 0,
        });

        // 4. Update Heartbeat status
        await Heartbeat.findOneAndUpdate(
          { sessionId },
          { visitorId, websiteId, lastActive: new Date() },
          { upsert: true }
        );

        break;
      }

      case "page_duration": {
        const { url, duration } = data;

        // Find the page view record and update its duration
        const latestPageView = await PageView.findOne({
          sessionId,
          websiteId,
          url,
        }).sort({ timestamp: -1 });

        if (latestPageView) {
          latestPageView.duration = Math.max(latestPageView.duration, duration || 0);
          await latestPageView.save();
        }

        // Also update session endedAt
        await Session.findOneAndUpdate(
          { sessionId, websiteId },
          { endedAt: new Date() }
        );
        break;
      }

      case "session_duration": {
        const { duration } = data;

        // Update final session duration
        const session = await Session.findOne({ sessionId, websiteId });
        if (session) {
          session.duration = Math.max(session.duration, duration || 0);
          session.endedAt = new Date();
          if (session.duration > 10) {
            session.bounce = false;
          }
          await session.save();
        }
        break;
      }

      case "heartbeat": {
        const { url } = data;

        // Upsert heartbeat
        await Heartbeat.findOneAndUpdate(
          { sessionId },
          { visitorId, websiteId, lastActive: new Date() },
          { upsert: true }
        );

        // Update session active end time
        await Session.findOneAndUpdate(
          { sessionId, websiteId },
          { endedAt: new Date() }
        );
        break;
      }

      case "event": {
        const { url, eventName, eventData } = data;

        // Save Custom Event
        await Event.create({
          sessionId,
          visitorId,
          websiteId,
          eventName,
          eventData,
          url,
          timestamp: new Date(),
        });

        // Mark session bounce as false since user interacted
        await Session.findOneAndUpdate(
          { sessionId, websiteId },
          { bounce: false, endedAt: new Date() }
        );
        break;
      }

      case "error": {
        const { url, message, stack, type: errType } = data;

        // Save Client Error
        await ErrorModel.create({
          sessionId,
          visitorId,
          websiteId,
          url,
          message,
          stack,
          type: errType,
          timestamp: new Date(),
        });
        break;
      }

      case "performance": {
        const { url, domReady, pageLoad, firstPaint, largestContentfulPaint, cls } = data;

        // Save Performance Metric
        await Performance.create({
          sessionId,
          visitorId,
          websiteId,
          url,
          domReady,
          pageLoad,
          firstPaint,
          largestContentfulPaint,
          cls,
          timestamp: new Date(),
        });
        break;
      }

      default:
        return error("Loại tracking không hợp lệ");
    }

    return success({ received: true });
  } catch (err) {
    return handleError(err);
  }
}
