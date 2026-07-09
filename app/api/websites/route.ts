import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { Website } from "@/lib/models/Website";
import { requireAuth } from "@/lib/auth";
import { success, error, handleError } from "@/lib/helpers";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    await connectDB();

    // Admins can see all websites, standard users see only their owned websites
    const filter = user.role === "ADMIN" ? {} : { owner: user._id };
    const websites = await Website.find(filter).sort({ createdAt: -1 });

    return success(websites);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    await connectDB();

    const { name, domain, healthCheckUrl } = await request.json();
    if (!name || !domain) {
      return error("Tên website và domain là bắt buộc");
    }

    // Normalize domain by stripping protocols and www
    const cleanDomain = domain
      .toLowerCase()
      .replace(/^(https?:\/\/)?(www\.)?/, "")
      .split("/")[0]; // keep only host

    const apiKey = "kpi_" + crypto.randomBytes(16).toString("hex");

    const website = await Website.create({
      name,
      domain: cleanDomain,
      healthCheckUrl: typeof healthCheckUrl === "string" ? healthCheckUrl.trim() : "",
      apiKey,
      status: "active",
      owner: user._id,
    });

    return success(website, 201);
  } catch (err) {
    return handleError(err);
  }
}
