import twilio from "twilio";
import fetch from "node-fetch";
import { bookMeeting } from "./calendar.mjs";

// 🧠 OpenRouter Configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "gpt-4o-mini"; // can also use "meta-llama/llama-3.1-8b-instruct" or others

/**
 * 🧠 Call OpenRouter API to extract name + datetime
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
              "You are a precise data extraction assistant. Return only valid JSON — no explanations, no markdown.",
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
 * 📞 Step 1: Handle incoming Twilio call
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
 * 🎙️ Step 2: Handle speech transcription callback
 */
export async function processSpeech(req, res) {
  const transcription = req.body.TranscriptionText || "User did not speak";
  console.log("🗣 Transcription received:", transcription);

  const currentDate = new Date().toISOString();

  const PROMPT = `
You are a JSON data extraction assistant.

Current date (ISO): ${currentDate}
User text: "${transcription}"

Extract and return strictly in JSON format:
{
  "name": "Full name spoken by user",
  "datetime": "YYYY-MM-DDTHH:MM:SS" // Local time in Asia/Karachi
}

If unclear, return {}.
`;

  let meetingData = null;

  try {
    const aiResponse = await callOpenRouter(PROMPT);
    const cleaned = aiResponse.replace(/^```json\s*|```\s*$/g, "").trim();

    console.log("🤖 Raw output:", aiResponse);
    console.log("🧹 Cleaned JSON:", cleaned);

    meetingData = JSON.parse(cleaned);

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

  // ✅ Use the AI-provided datetime directly (no conversion)
  const meetingTime = new Date(meetingData.datetime);

  // ⏰ Book 30-minute meeting in Google Calendar
  await bookMeeting(meetingData.name, meetingTime);

  // 🎙️ Format for voice output
  const dateStr = meetingTime.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Karachi",
  });
  const timeStr = meetingTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Karachi",
  });

  // 🗣️ Final Twilio XML Response
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(`Ok ${meetingData.name}, I booked your appointment on ${dateStr} at ${timeStr}.`);

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}
