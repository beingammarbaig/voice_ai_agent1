import twilio from "twilio";
import fetch from "node-fetch";
import { bookMeeting } from "./calendar.mjs";
import { connectDB, User, Meeting, CallLog } from "./db.mjs";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "gpt-4o-mini";

/**
 * 🧠 Call OpenRouter API
 */
async function callOpenRouter(prompt) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "Return structured JSON only." },
        { role: "user", content: prompt },
      ],
    }),
  });

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("No content returned from OpenRouter");
  return text;
}

/**
 * 📞 Step 1: Handle the initial Twilio call
 */
export async function handleCallWebhook(req, res) {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(
    "Hello! I'm your scheduling assistant. Please tell me your name and the day and time you'd like to book your meeting."
  );
  twiml.record({
    transcribe: true,
    transcribeCallback: "/process-speech",
  });

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}

/**
 * 🎙️ Step 2: Handle transcription and booking
 */
export async function processSpeech(req, res) {
  await connectDB();

  const transcription = req.body.TranscriptionText || "User did not speak";
  console.log("🗣 Transcription received:", transcription);

  // Save call log
  await CallLog.create({ transcription });

  const currentDate = new Date().toISOString();
  const PROMPT = `
Extract only name and meeting datetime.

Current date: ${currentDate}
User text: "${transcription}"

Output:
{
  "name": "Full Name",
  "datetime": "YYYY-MM-DDTHH:MM:SS"  // Asia/Karachi time
}
`;

  let meetingData;
  try {
    const aiResponse = await callOpenRouter(PROMPT);
    const cleaned = aiResponse.replace(/^```json\s*|```\s*$/g, "").trim();
    meetingData = JSON.parse(cleaned);
  } catch (err) {
    console.error("❌ Extraction failed:", err.message);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Sorry, I could not understand the details. Please try again.");
    res.writeHead(200, { "Content-Type": "text/xml" });
    return res.end(twiml.toString());
  }

  if (!meetingData.name || !meetingData.datetime) {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Sorry, I could not understand the date or name. Please try again.");
    res.writeHead(200, { "Content-Type": "text/xml" });
    return res.end(twiml.toString());
  }

  // ✅ Use datetime directly
  const meetingTime = new Date(meetingData.datetime);
  const dateStr = meetingTime.toISOString().split("T")[0];
  const timeStr = meetingTime.toISOString().split("T")[1].slice(0, 5);

  // 🕐 Check if slot is already booked
  const slotExists = await Meeting.findOne({
    datetime: meetingTime,
  });

  if (slotExists) {
    console.log("❌ Slot not available:", meetingData.datetime);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Sorry, that slot is not available. Please choose another time.");
    res.writeHead(200, { "Content-Type": "text/xml" });
    return res.end(twiml.toString());
  }

  // 🗓️ Create event in Google Calendar
  const eventId = await bookMeeting(meetingData.name, meetingTime);

  // 💾 Save meeting in MongoDB
  const user = await User.findOneAndUpdate(
    { name: meetingData.name },
    { name: meetingData.name },
    { upsert: true, new: true }
  );

  await Meeting.create({
    userId: user._id,
    name: meetingData.name,
    date: dateStr,
    time: timeStr,
    datetime: meetingTime,
    calendarEventId: eventId,
    status: "scheduled",
  });

  // 🎙️ Respond to caller
  const twiml = new twilio.twiml.VoiceResponse();
  const humanDate = meetingTime.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const humanTime = meetingTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  twiml.say(`Ok ${meetingData.name}, I booked your appointment on ${humanDate} at ${humanTime}.`);
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}
