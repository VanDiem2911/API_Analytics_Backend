import mongoose, { Schema, Document } from "mongoose";

export interface IError extends Document {
  _id: mongoose.Types.ObjectId;
  sessionId: string;
  visitorId: string;
  websiteId: mongoose.Types.ObjectId;
  url: string;
  message: string;
  stack: string;
  type: "error" | "unhandledrejection";
  timestamp: Date;
}

const ErrorSchema = new Schema<IError>(
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
    message: {
      type: String,
      required: true,
    },
    stack: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      enum: ["error", "unhandledrejection"],
      default: "error",
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

export const ErrorModel = mongoose.models.Error || mongoose.model<IError>("Error", ErrorSchema);
export default ErrorModel;
