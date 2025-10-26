import twilio from "twilio";
import fetch from "node-fetch";
import { bookMeeting } from "./calendar.mjs";

// Environment variables
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "gpt-4o-mini"; // You can replace with another OpenRouter model

/**
 * 🧠 Calls OpenRouter to extract structured data (name + datetime)
 */
async function callOpenRouter(prompt) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a precise data extraction assistant. Return only JSON — no explanations.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("No content returned from OpenRouter");
    return text;
  } catch (err) {
    throw new Error(`OpenRouter API call failed: ${err.message}`);
  }
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
 * 🎙️ Step 2: Handle Twilio transcription callback
 */
export async function processSpeech(req, res) {
  const transcription = req.body.TranscriptionText || "User did not speak";
  console.log("🗣 Transcription received:", transcription);

  const currentDate = new Date().toISOString();

  const PROMPT = `
You are a JSON data extraction agent.

Current date (ISO): ${currentDate}
User text: "${transcription}"

Extract two fields:
{
  "name": "Full Name",
  "datetime": "YYYY-MM-DDTHH:MM:SS"  // Asia/Karachi local time
}

If date or time is unclear, return an empty object: {}
`;

  let meetingData = null;

  try {
    const aiResponse = await callOpenRouter(PROMPT);
    const cleaned = aiResponse.replace(/^```json\s*|```\s*$/g, "").trim();

    console.log("🤖 Raw output:", aiResponse);
    console.log("🧹 Cleaned JSON:", cleaned);

    meetingData = JSON.parse(cleaned);

    // ❌ If no valid extraction
    if (!meetingData.name || !meetingData.datetime) {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say("Sorry, I couldn't understand the date or time. Please try again.");
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }
  } catch (err) {
    console.error("❌ Parsing failed:", err.message);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Sorry, I couldn't process your meeting request. Please try again later.");
    res.writeHead(200, { "Content-Type": "text/xml" });
    return res.end(twiml.toString());
  }

  // ✅ Convert to Asia/Karachi timezone and ensure correct ISO
  const karachiTime = new Date(
    new Date(meetingData.datetime).toLocaleString("en-US", { timeZone: "Asia/Karachi" })
  );

  // ⏰ Book the meeting
  await bookMeeting(meetingData.name, karachiTime);

  // 🎙️ Format voice-friendly date & time
  const dateStr = karachiTime.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Karachi",
  });
  const timeStr = karachiTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Karachi",
  });

  // 🗣️ Final Twilio Voice Response
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(`Ok ${meetingData.name}, I booked your appointment on ${dateStr} at ${timeStr}.`);

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}
