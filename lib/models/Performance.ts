import mongoose, { Schema, Document } from "mongoose";

export interface IPerformance extends Document {
  _id: mongoose.Types.ObjectId;
  sessionId: string;
  visitorId: string;
  websiteId: mongoose.Types.ObjectId;
  url: string;
  domReady: number; // in milliseconds
  pageLoad: number; // in milliseconds
  firstPaint: number; // in milliseconds
  largestContentfulPaint: number; // in milliseconds
  cls: number; // Cumulative Layout Shift score
  timestamp: Date;
}

const PerformanceSchema = new Schema<IPerformance>(
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
      default: "",
    },
    domReady: {
      type: Number,
      default: 0,
    },
    pageLoad: {
      type: Number,
      default: 0,
    },
    firstPaint: {
      type: Number,
      default: 0,
    },
    largestContentfulPaint: {
      type: Number,
      default: 0,
    },
    cls: {
      type: Number,
      default: 0,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

export const Performance = mongoose.models.Performance || mongoose.model<IPerformance>("Performance", PerformanceSchema);
export default Performance;
