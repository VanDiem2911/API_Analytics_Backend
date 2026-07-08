import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { Website } from "@/lib/models/Website";
import { Visitor } from "@/lib/models/Visitor";
import { Session } from "@/lib/models/Session";
import { PageView } from "@/lib/models/PageView";
import { Event } from "@/lib/models/Event";
import { Performance } from "@/lib/models/Performance";
import { ErrorModel } from "@/lib/models/Error";
import { Heartbeat } from "@/lib/models/Heartbeat";
import { requireAuth } from "@/lib/auth";
import { success, error, handleError } from "@/lib/helpers";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request);
    await connectDB();

    const website = await Website.findById(params.id);
    if (!website) return error("Không tìm thấy website", 404);

    // Authorization check: Only owner or ADMIN can update
    if (user.role !== "ADMIN" && website.owner.toString() !== user._id.toString()) {
      return error("Không có quyền chỉnh sửa website này", 403);
    }

    const { name, domain, status } = await request.json();

    if (name) website.name = name;
    if (domain) {
      website.domain = domain
        .toLowerCase()
        .replace(/^(https?:\/\/)?(www\.)?/, "")
        .split("/")[0];
    }
    if (status && ["active", "inactive"].includes(status)) {
      website.status = status;
    }

    await website.save();
    return success(website);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request);
    await connectDB();

    const website = await Website.findById(params.id);
    if (!website) return error("Không tìm thấy website", 404);

    // Authorization check: Only owner or ADMIN can delete
    if (user.role !== "ADMIN" && website.owner.toString() !== user._id.toString()) {
      return error("Không có quyền xóa website này", 403);
    }

    const websiteId = website._id;

    // Delete the website itself
    await Website.findByIdAndDelete(websiteId);

    // Cascading delete all tracking data related to this website
    await Visitor.deleteMany({ websiteId });
    await Session.deleteMany({ websiteId });
    await PageView.deleteMany({ websiteId });
    await Event.deleteMany({ websiteId });
    await Performance.deleteMany({ websiteId });
    await ErrorModel.deleteMany({ websiteId });
    await Heartbeat.deleteMany({ websiteId });

    return success({
      message: "Đã xóa website và toàn bộ dữ liệu thống kê liên quan thành công",
    });
  } catch (err) {
    return handleError(err);
  }
}
