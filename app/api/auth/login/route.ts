import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { generateToken } from "@/lib/auth";
import { success, error, handleError } from "@/lib/helpers";

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { email, password } = await request.json();

    if (!email || !password) {
      return error("Email và mật khẩu là bắt buộc");
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
    if (!user) return error("Email hoặc mật khẩu không đúng", 401);

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return error("Email hoặc mật khẩu không đúng", 401);

    if (!user.isActive) return error("Tài khoản đã bị vô hiệu hóa", 403);

    const token = generateToken(user);
    return success({
      token,
      user: {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
