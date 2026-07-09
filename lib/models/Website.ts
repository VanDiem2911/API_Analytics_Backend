import mongoose, { Schema, Document } from "mongoose";

export interface IWebsite extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  domain: string;
  healthCheckUrl?: string;
  apiKey: string;
  status: "active" | "inactive";
  owner: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WebsiteSchema = new Schema<IWebsite>(
  {
    name: {
      type: String,
      required: [true, "Tên website là bắt buộc"],
      trim: true,
    },
    domain: {
      type: String,
      required: [true, "Domain là bắt buộc"],
      trim: true,
      lowercase: true,
    },
    healthCheckUrl: {
      type: String,
      trim: true,
      default: "",
    },
    apiKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export const Website = mongoose.models.Website || mongoose.model<IWebsite>("Website", WebsiteSchema);
export default Website;
