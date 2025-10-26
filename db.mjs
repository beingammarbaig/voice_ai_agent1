import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI; // e.g., mongodb+srv://user:pass@cluster/db

export async function connectDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI, { dbName: "scheduler" });
    console.log("✅ Connected to MongoDB");
  }
}

// 🧑‍💼 User Schema
const userSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
});

// 📅 Meeting Schema
const meetingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  date: String,
  time: String,
  datetime: Date,
  status: { type: String, default: "scheduled" },
  calendarEventId: String,
});

// 📞 Call Log Schema
const callLogSchema = new mongoose.Schema({
  transcription: String,
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.model("User", userSchema);
export const Meeting = mongoose.model("Meeting", meetingSchema);
export const CallLog = mongoose.model("CallLog", callLogSchema);
