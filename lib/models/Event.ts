import mongoose, { Schema, Document } from "mongoose";

export interface IEvent extends Document {
  _id: mongoose.Types.ObjectId;
  sessionId: string;
  visitorId: string;
  websiteId: mongoose.Types.ObjectId;
  eventName: string;
  eventData: Record<string, any>;
  url: string;
  timestamp: Date;
}

const EventSchema = new Schema<IEvent>(
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
    eventName: {
      type: String,
      required: true,
      index: true,
    },
    eventData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    url: {
      type: String,
      default: "",
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

export const Event = mongoose.models.Event || mongoose.model<IEvent>("Event", EventSchema);
export default Event;
