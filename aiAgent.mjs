import twilio from "twilio";
import { bookMeeting } from "./calendar.mjs";
import fetch from "node-fetch"; // For OpenRouter API calls

// Set this in Vercel environment variables
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "gpt-4o-mini"; // or any other OpenRouter model (e.g., "mistralai/mixtral-8x7b")

/**
 * Calls OpenRouter API to extract name and datetime
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
              "You are a JSON data extraction agent. Extract only structured data in JSON format.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("No text returned from OpenRouter");
    return text;
  } catch (err) {
    throw new Error(`OpenRouter API call failed: ${err.message}`);
  }
}

/**
 * Handle initial call
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
 * Handle Twilio transcription callback
 */
export async function processSpeech(req, res) {
  const transcription = req.body.TranscriptionText || "User did not speak";
  console.log("🗣 Transcription received:", transcription);

  const currentDate = new Date().toISOString();

  const PROMPT_INSTRUCTION = `
You are a data extraction assistant.
Extract the person's name and the meeting datetime from the following user text.

Current date: ${currentDate}
User text: "${transcription}"

Rules:
- Output only valid JSON.
- JSON format:
{
  "name": "Full Name",
  "datetime": "YYYY-MM-DDTHH:MM:SS"
}
If date or time is unclear, return an empty JSON: {}
`;

  let meetingData = null;

  try {
    const openRouterOutput = await callOpenRouter(PROMPT_INSTRUCTION);
    const cleanedOutput = openRouterOutput.replace(/^```json\s*|```\s*$/g, "").trim();
    console.log("🤖 Raw output:", openRouterOutput);
    console.log("🧹 Cleaned JSON:", cleanedOutput);

    meetingData = JSON.parse(cleanedOutput);

    if (!meetingData.name || !meetingData.datetime) {
      console.log("⚠️ Missing fields, skipping calendar creation.");
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say("Sorry, I could not understand the date or time. Please try again.");
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }
  } catch (err) {
    console.error("❌ Data extraction or parsing failed:", err.message);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Sorry, I could not extract your meeting details. Please try again later.");
    res.writeHead(200, { "Content-Type": "text/xml" });
    return res.end(twiml.toString());
  }

  // --- Timezone correction (Asia/Karachi) ---
  const userDate = new Date(meetingData.datetime);
  const karachiTime = new Date(
    userDate.toLocaleString("en-US", { timeZone: "Asia/Karachi" })
  );

  // ✅ Book in Google Calendar (30-min duration)
  await bookMeeting(meetingData.name, karachiTime.toISOString());

  // Format date/time for Twilio voice response
  const dateOptions = { year: "numeric", month: "2-digit", day: "2-digit" };
  const timeOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Karachi",
  };

  const dateStr = karachiTime.toLocaleDateString("en-US", dateOptions);
  const timeStr = karachiTime.toLocaleTimeString("en-US", timeOptions);

  // --- Twilio Voice Response ---
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(`Ok ${meetingData.name}, I booked your appointment on ${dateStr} at ${timeStr}.`);
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}
