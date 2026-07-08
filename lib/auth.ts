import jwt from "jsonwebtoken";
import { connectDB } from "@/lib/db";
import { User, IUser } from "@/lib/models/User";
import { NextRequest } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET || "analytics_jwt_secret_key_change_me_in_production";

export interface JwtPayload {
  userId: string;
  email: string;
  role: "ADMIN" | "USER";
}

export function generateToken(user: IUser): string {
  return jwt.sign(
    { userId: user._id.toString(), email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export async function getCurrentUser(request: NextRequest): Promise<IUser | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    await connectDB();
    const user = await User.findById(payload.userId);
    if (!user || !user.isActive) return null;
    return user;
  } catch {
    return null;
  }
}

export async function requireAuth(request: NextRequest): Promise<IUser> {
  const user = await getCurrentUser(request);
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireAdmin(request: NextRequest): Promise<IUser> {
  const user = await requireAuth(request);
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}
