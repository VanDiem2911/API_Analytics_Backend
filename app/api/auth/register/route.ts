import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { success, error, handleError } from "@/lib/helpers";

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { email, password, fullName } = await request.json();

    if (!email || !password || !fullName) {
      return error("Họ tên, email và mật khẩu là bắt buộc");
    }

    if (password.length < 6) {
      return error("Mật khẩu tối thiểu 6 ký tự");
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return error("Email đã được sử dụng");
    }

    // Dynamically make the first registered user the ADMIN
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? "ADMIN" : "USER";

    const user = await User.create({
      email: email.toLowerCase(),
      password,
      fullName,
      role,
      isActive: true,
    });

    return success(
      {
        user: {
          _id: user._id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
      },
      201
    );
  } catch (err) {
    return handleError(err);
  }
}
