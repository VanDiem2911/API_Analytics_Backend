import mongoose from "mongoose";
import { connectDB } from "../lib/db";
import { User } from "../lib/models/User";
import { Website } from "../lib/models/Website";
import { Visitor } from "../lib/models/Visitor";
import { Session } from "../lib/models/Session";
import { PageView } from "../lib/models/PageView";
import { Event } from "../lib/models/Event";
import { Performance } from "../lib/models/Performance";
import { ErrorModel } from "../lib/models/Error";
import { Heartbeat } from "../lib/models/Heartbeat";

// Set environment variables for DB connecting
process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/analytics_db";

const BROWSERS = ["Chrome", "Safari", "Firefox", "Edge", "Opera"];
const BROWSER_PROBS = [0.70, 0.15, 0.08, 0.05, 0.02];

const OS_LIST = ["Windows", "MacOS", "Linux", "Android", "iOS"];
const OS_PROBS = [0.60, 0.20, 0.05, 0.08, 0.07];

const DEVICES = ["desktop", "tablet", "mobile"];
const DEVICE_PROBS = [0.75, 0.05, 0.20];

const COUNTRIES = [
  { country: "Vietnam", cities: ["Ho Chi Minh City", "Hanoi", "Da Nang", "Can Tho"] },
  { country: "United States", cities: ["New York", "San Francisco", "Los Angeles", "Chicago"] },
  { country: "Singapore", cities: ["Singapore"] },
  { country: "Japan", cities: ["Tokyo", "Osaka", "Kyoto"] },
  { country: "South Korea", cities: ["Seoul", "Busan"] }
];
const COUNTRY_PROBS = [0.75, 0.12, 0.05, 0.04, 0.04];

const REFERRERS = [
  { url: "", domain: "Direct" },
  { url: "https://www.google.com", domain: "Google" },
  { url: "https://www.facebook.com", domain: "Facebook" },
  { url: "https://www.tiktok.com", domain: "TikTok" },
  { url: "https://github.com", domain: "GitHub" },
  { url: "https://news.ycombinator.com", domain: "HackerNews" }
];
const REFERRER_PROBS = [0.35, 0.35, 0.15, 0.08, 0.05, 0.02];

const PAGES = [
  { url: "/", title: "Trang chủ | DUDI Software" },
  { url: "/features", title: "Tính năng | DUDI Software" },
  { url: "/pricing", title: "Bảng giá dịch vụ | DUDI Software" },
  { url: "/docs", title: "Tài liệu hướng dẫn | DUDI Software" },
  { url: "/blog", title: "Tin tức công nghệ | DUDI Software" },
  { url: "/contact", title: "Liên hệ | DUDI Software" }
];

function selectRandom<T>(items: T[], probabilities: number[]): T {
  const r = Math.random();
  let sum = 0;
  for (let i = 0; i < items.length; i++) {
    sum += probabilities[i];
    if (r <= sum) return items[i];
  }
  return items[items.length - 1];
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function seed() {
  try {
    console.log("Connecting to Database...");
    await connectDB();

    console.log("Cleaning Database...");
    await User.deleteMany({});
    await Website.deleteMany({});
    await Visitor.deleteMany({});
    await Session.deleteMany({});
    await PageView.deleteMany({});
    await Event.deleteMany({});
    await Performance.deleteMany({});
    await ErrorModel.deleteMany({});
    await Heartbeat.deleteMany({});

    console.log("Seeding Admin User...");
    const admin = await User.create({
      email: "admin@gmail.com",
      password: "123456", // Pre-save hook hashes it automatically
      fullName: "Admin Analytics",
      role: "ADMIN",
      isActive: true
    });

    console.log("Seeding Websites...");
    const dudiWeb = await Website.create({
      name: "DUDI Software",
      domain: "dudi.vn",
      apiKey: "kpi_dudi_software_development_key_123",
      status: "active",
      owner: admin._id
    });

    const blogWeb = await Website.create({
      name: "My Personal Blog",
      domain: "blog.antigravity.dev",
      apiKey: "kpi_blog_antigravity_dev_key_456",
      status: "active",
      owner: admin._id
    });

    const websites = [dudiWeb, blogWeb];

    console.log("Generating 60 days of historical tracking data...");
    const now = new Date();
    
    // We will generate data for the last 60 days
    for (let dayOffset = 60; dayOffset >= 0; dayOffset--) {
      const targetDate = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
      const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6;
      
      // Let's create a general upward growth trend
      const growthFactor = (60 - dayOffset) / 60.0; // 0 to 1
      
      // Base traffic range (higher on weekdays, lower on weekends, grows over time)
      const baseSessions = isWeekend ? getRandomInt(10, 20) : getRandomInt(25, 45);
      const totalSessions = Math.round(baseSessions * (1 + growthFactor * 1.5)); // starts at ~25-45, grows to ~60-110

      console.log(`- Seeding ${targetDate.toDateString()}: generating ${totalSessions} sessions...`);

      for (let s = 0; s < totalSessions; s++) {
        // Distribute sessions organically throughout the hours of the day (bell curve around 14:00)
        const hour = Math.round(getRandomInt(0, 23) * 0.3 + 14 * 0.7); // skew towards daytime
        const minute = getRandomInt(0, 59);
        const second = getRandomInt(0, 59);
        
        const sessionDate = new Date(targetDate);
        sessionDate.setHours(hour, minute, second);

        // Website selector (75% DUDI Web, 25% Blog)
        const website = Math.random() < 0.75 ? websites[0] : websites[1];
        const websiteId = website._id;

        // Visitor profiling
        const visitorId = "vis_" + generateUUID().substring(0, 8);
        const sessionId = "sess_" + generateUUID().substring(0, 12);
        const browser = selectRandom(BROWSERS, BROWSER_PROBS);
        const os = selectRandom(OS_LIST, OS_PROBS);
        const device = selectRandom(DEVICES, DEVICE_PROBS);
        
        const countryObj = selectRandom(COUNTRIES, COUNTRY_PROBS);
        const country = countryObj.country;
        const city = countryObj.cities[getRandomInt(0, countryObj.cities.length - 1)];
        const screenResolution = device === "desktop" ? "1920x1080" : device === "tablet" ? "1024x768" : "390x844";

        // Save Visitor (if not already existing)
        await Visitor.findOneAndUpdate(
          { visitorId, websiteId },
          {
            firstSeen: new Date(sessionDate.getTime() - getRandomInt(0, 10) * 24 * 60 * 60 * 1000), // might have seen in last 10 days
            lastSeen: sessionDate,
            browser,
            os,
            device,
            language: "vi-VN",
            timezone: "Asia/Ho_Chi_Minh",
            country,
            city,
            screenResolution
          },
          { upsert: true }
        );

        // Referrer and campaign
        const referrerObj = selectRandom(REFERRERS, REFERRER_PROBS);
        const referrer = referrerObj.url;
        const referrerDomain = referrerObj.domain;

        let utmSource = "";
        let utmMedium = "";
        let utmCampaign = "";

        // 15% of sessions have campaigns (mostly from Facebook/TikTok)
        if (Math.random() < 0.15 && (referrerDomain === "Facebook" || referrerDomain === "TikTok")) {
          utmSource = referrerDomain.toLowerCase();
          utmMedium = "cpc";
          utmCampaign = Math.random() < 0.5 ? "summer_promo" : "brand_awareness";
        }

        // Simulate page views in session (1 to 5 pages)
        const maxPages = getRandomInt(1, 5);
        let currentSessionTime = sessionDate.getTime();
        const pageViewsList: any[] = [];
        let totalSessionDuration = 0;

        for (let p = 0; p < maxPages; p++) {
          const page = PAGES[p === 0 ? 0 : getRandomInt(1, PAGES.length - 1)]; // First page is home, then others
          const pageDuration = getRandomInt(5, 120); // seconds spent on page
          
          const pvTimestamp = new Date(currentSessionTime);

          const pv = await PageView.create({
            sessionId,
            visitorId,
            websiteId,
            url: page.url,
            title: page.title,
            referrer: p === 0 ? referrer : "https://" + website.domain + PAGES[p - 1].url,
            timestamp: pvTimestamp,
            duration: pageDuration
          });

          pageViewsList.push(pv);
          totalSessionDuration += pageDuration;
          currentSessionTime += pageDuration * 1000;

          // Performance record on first page
          if (p === 0) {
            await Performance.create({
              sessionId,
              visitorId,
              websiteId,
              url: page.url,
              domReady: getRandomInt(150, 600),
              pageLoad: getRandomInt(250, 1200),
              firstPaint: getRandomInt(80, 250),
              largestContentfulPaint: getRandomInt(200, 1500),
              cls: parseFloat((Math.random() * 0.15).toFixed(3)),
              timestamp: pvTimestamp
            });
          }

          // Trigger Custom Event (e.g. Purchase, Register, Click Demo)
          if (page.url === "/pricing" && Math.random() < 0.25) {
            await Event.create({
              sessionId,
              visitorId,
              websiteId,
              eventName: "Purchase",
              eventData: { price: selectRandom([49, 99, 199], [0.5, 0.3, 0.2]), currency: "USD" },
              url: page.url,
              timestamp: new Date(currentSessionTime - 2000)
            });
          } else if (page.url === "/features" && Math.random() < 0.30) {
            await Event.create({
              sessionId,
              visitorId,
              websiteId,
              eventName: "Register",
              eventData: { type: "free_trial", source: "Features Page" },
              url: page.url,
              timestamp: new Date(currentSessionTime - 5000)
            });
          } else if (page.url === "/" && Math.random() < 0.15) {
            await Event.create({
              sessionId,
              visitorId,
              websiteId,
              eventName: "Click Demo",
              eventData: { position: "hero_section" },
              url: page.url,
              timestamp: new Date(currentSessionTime - 3000)
            });
          }

          // Trigger JS Error sometimes (1% chance)
          if (Math.random() < 0.015) {
            await ErrorModel.create({
              sessionId,
              visitorId,
              websiteId,
              url: page.url,
              message: selectRandom(
                ["TypeError: Cannot read properties of null (reading 'style')", "ReferenceError: process is not defined", "Unhandled Promise Rejection: API request failed"],
                [0.5, 0.3, 0.2]
              ),
              stack: "Error: at PageViewComponent.tsx:42:15\n    at HTMLButtonElement.dispatch (react-dom.production.min.js:18:245)",
              type: Math.random() < 0.7 ? "error" : "unhandledrejection",
              timestamp: new Date(currentSessionTime - 1000)
            });
          }
        }

        // Save final Session
        await Session.create({
          sessionId,
          visitorId,
          websiteId,
          startedAt: sessionDate,
          endedAt: new Date(currentSessionTime),
          referrer,
          referrerDomain,
          utmSource,
          utmMedium,
          utmCampaign,
          duration: totalSessionDuration,
          bounce: maxPages === 1 && pageViewsList.length === 1 // True if single page view, false if more or events triggered
        });
      }
    }

    // Generate online realtime active heartbeat records for TODAY (right now)
    console.log("Generating real-time online heartbeats (simulating active users)...");
    for (let o = 0; o < 8; o++) {
      const activeVisitorId = "vis_online_" + o;
      const activeSessionId = "sess_online_" + o;
      const website = websites[o % 2];
      
      const sessionDate = new Date(Date.now() - getRandomInt(5, 50) * 1000); // started within last 50s
      
      // Upsert Visitor
      await Visitor.findOneAndUpdate(
        { visitorId: activeVisitorId, websiteId: website._id },
        {
          firstSeen: new Date(sessionDate.getTime() - 24 * 60 * 60 * 1000),
          lastSeen: new Date(),
          browser: "Chrome",
          os: "MacOS",
          device: "desktop",
          language: "vi-VN",
          timezone: "Asia/Ho_Chi_Minh",
          country: o % 2 === 0 ? "Vietnam" : "Singapore",
          city: o % 2 === 0 ? "Hanoi" : "Singapore",
          screenResolution: "1440x900"
        },
        { upsert: true }
      );

      // Create Session
      await Session.create({
        sessionId: activeSessionId,
        visitorId: activeVisitorId,
        websiteId: website._id,
        startedAt: sessionDate,
        endedAt: new Date(),
        referrer: "https://www.google.com",
        referrerDomain: "Google",
        duration: 30,
        bounce: false
      });

      // Create PageView
      const page = PAGES[o % PAGES.length];
      await PageView.create({
        sessionId: activeSessionId,
        visitorId: activeVisitorId,
        websiteId: website._id,
        url: page.url,
        title: page.title,
        referrer: "https://www.google.com",
        timestamp: sessionDate,
        duration: 15
      });

      // Heartbeat active right now
      await Heartbeat.create({
        sessionId: activeSessionId,
        visitorId: activeVisitorId,
        websiteId: website._id,
        lastActive: new Date() // right now
      });
    }

    console.log("Seeding complete successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
}

seed();
