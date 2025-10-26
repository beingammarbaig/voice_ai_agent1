import twilio from "twilio";
import fetch from "node-fetch";
import { bookMeeting } from "./calendar.mjs";
import { connectDB, User, Meeting, CallLog } from "./db.mjs";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "gpt-4o-mini";
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

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
        { role: "system", content: "Return structured JSON only — no explanations." },
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
    "Hello! I'm your scheduling assistant. Please tell me your name, email address, and the day and time you'd like to book your meeting."
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

  // 💾 Save raw call log
  await CallLog.create({ transcription });

  const currentDate = new Date().toISOString();
  const PROMPT = `
Extract the name, email, and meeting datetime from the following text.

Current date: ${currentDate}
User text: "${transcription}"

Output valid JSON only:
{
  "name": "Full Name",
  "email": "user@example.com",
  "datetime": "YYYY-MM-DDTHH:MM:SS" // Asia/Karachi local time
}
`;

  let meetingData;
  try {
    const aiResponse = await callOpenRouter(PROMPT);
    console.log("🤖 OpenAI Raw Response:\n", aiResponse);

    const cleaned = aiResponse.replace(/^```json\s*|```\s*$/g, "").trim();
    meetingData = JSON.parse(cleaned);
  } catch (err) {
    console.error("❌ Data extraction failed:", err.message);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Sorry, I couldn't understand your meeting details. Please try again.");
    res.writeHead(200, { "Content-Type": "text/xml" });
    return res.end(twiml.toString());
  }

  if (!meetingData.name || !meetingData.datetime || !meetingData.email) {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Sorry, I need your name, email, and meeting date/time to schedule it properly.");
    res.writeHead(200, { "Content-Type": "text/xml" });
    return res.end(twiml.toString());
  }

  const meetingTime = new Date(meetingData.datetime);
  const dateStr = meetingTime.toISOString().split("T")[0];
  const timeStr = meetingTime.toISOString().split("T")[1].slice(0, 5);

  console.log(`📅 Parsed Meeting — Name: ${meetingData.name}, Email: ${meetingData.email}, DateTime: ${meetingData.datetime}`);

  // 🕐 Check if the slot is already booked
  const slotExists = await Meeting.findOne({ datetime: meetingTime });
  if (slotExists) {
    console.log("⚠️ Slot not available for:", meetingData.datetime);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Sorry, that slot is not available. Please choose another time.");
    res.writeHead(200, { "Content-Type": "text/xml" });
    return res.end(twiml.toString());
  }

  // 🗓️ Create Google Calendar event (sends email invite automatically)
  const eventId = await bookMeeting(meetingData.name, meetingTime, meetingData.email);
  console.log("✅ Google Calendar event created. Event ID:", eventId);

  // 💾 Save user + meeting in DB
  const user = await User.findOneAndUpdate(
    { email: meetingData.email },
    { name: meetingData.name, email: meetingData.email },
    { upsert: true, new: true }
  );

  await Meeting.create({
    userId: user._id,
    name: meetingData.name,
    email: meetingData.email,
    date: dateStr,
    time: timeStr,
    datetime: meetingTime,
    calendarEventId: eventId,
    status: "scheduled",
  });

  console.log(`✅ Meeting saved in DB for ${meetingData.name} at ${meetingData.datetime}`);

  // 📱 Send SMS confirmation (optional)
  try {
    await twilioClient.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to: req.body.From, // user's phone number
      body: `📅 Hi ${meetingData.name}, your meeting has been scheduled for ${dateStr} at ${timeStr} (Asia/Karachi). A calendar invite has been sent to ${meetingData.email}.`,
    });
    console.log("📨 SMS confirmation sent successfully");
  } catch (err) {
    console.error("⚠️ Failed to send SMS:", err.message);
  }

  // 🎙️ Respond via voice
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

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(
    `Okay ${meetingData.name}, your meeting is booked on ${humanDate} at ${humanTime}. 
    You’ll receive a confirmation email at ${meetingData.email} shortly.`
  );

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}
