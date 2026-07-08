import mongoose, { Schema, Document } from "mongoose";

export interface IHeartbeat extends Document {
  _id: mongoose.Types.ObjectId;
  sessionId: string;
  visitorId: string;
  websiteId: mongoose.Types.ObjectId;
  lastActive: Date;
}

const HeartbeatSchema = new Schema<IHeartbeat>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true, // Upsert based on sessionId
      index: true,
    },
    visitorId: {
      type: String,
      required: true,
    },
    websiteId: {
      type: Schema.Types.ObjectId,
      ref: "Website",
      required: true,
      index: true,
    },
    lastActive: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// Heartbeat records older than 1 hour can be automatically cleaned up by MongoDB if needed,
// but we will manage them in the API or just rely on standard TTL if desired.
// Let's add a TTL index of 3600 seconds (1 hour) on lastActive so heartbeats auto-expire from MongoDB.
// This is very clean and prevents the collection from growing indefinitely!
HeartbeatSchema.index({ lastActive: 1 }, { expireAfterSeconds: 3600 });

export const Heartbeat = mongoose.models.Heartbeat || mongoose.model<IHeartbeat>("Heartbeat", HeartbeatSchema);
export default Heartbeat;
