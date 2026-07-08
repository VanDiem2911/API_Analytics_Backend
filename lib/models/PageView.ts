import mongoose, { Schema, Document } from "mongoose";

export interface IPageView extends Document {
  _id: mongoose.Types.ObjectId;
  sessionId: string;
  visitorId: string;
  websiteId: mongoose.Types.ObjectId;
  url: string;
  title: string;
  referrer: string;
  timestamp: Date;
  duration: number; // in seconds, updated when leaving the page
}

const PageViewSchema = new Schema<IPageView>(
  {
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    visitorId: {
      type: String,
      required: true,
      index: true,
    },
    websiteId: {
      type: Schema.Types.ObjectId,
      ref: "Website",
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: "",
    },
    referrer: {
      type: String,
      default: "",
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    duration: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const PageView = mongoose.models.PageView || mongoose.model<IPageView>("PageView", PageViewSchema);
export default PageView;
