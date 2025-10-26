import twilio from "twilio";
import { bookMeeting } from "./calendar.mjs";
import fetch from "node-fetch"; // Needed for OpenRouter API calls

// --- Use OpenRouter API instead of Gemini ---
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "gpt-4o-mini"; // You can change this to another OpenRouter-supported model

/**
 * Calls OpenRouter API to extract structured meeting data.
 */
async function callOpenRouter(prompt) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that extracts structured meeting data (name and datetime) from natural text.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text) throw new Error("No response text from OpenRouter");
    return text;
  } catch (err) {
    throw new Error(`OpenRouter API call failed: ${err.message}`);
  }
}

/**
 * Twilio: handle initial call
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
 * Twilio: handle speech transcription
 */
export async function processSpeech(req, res) {
  const transcription = req.body.TranscriptionText || "User did not speak";
  console.log("🗣 Transcription received:", transcription);

  const currentDate = new Date().toISOString().split("T")[0];

  const PROMPT_INSTRUCTION = `
You are a data extraction assistant.
Extract the person's full name and the meeting datetime (in YYYY-MM-DDTHH:MM:SS format) from the text below.

If the user mentions "tomorrow" or "day after tomorrow", use today's date (${currentDate}) to calculate it.

Output must be a single JSON object only, like this:
{
  "name": "Full Name",
  "datetime": "YYYY-MM-DDTHH:MM:SS"
}

Text:
"${transcription}"
`;

  let meetingData;

  try {
    const aiOutput = await callOpenRouter(PROMPT_INSTRUCTION);
    console.log("🤖 Raw AI output:", aiOutput);

    const cleaned = aiOutput.replace(/^```json\s*|```\s*$/g, "").trim();
    meetingData = JSON.parse(cleaned);

    if (!meetingData.name || !meetingData.datetime) {
      throw new Error("Missing required fields");
    }
  } catch (err) {
    console.error("❌ Data extraction failed. No meeting will be created:", err.message);
    // Stop execution without creating fallback meeting
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Sorry, I couldn't understand the details. Please try again.");
    res.writeHead(200, { "Content-Type": "text/xml" });
    return res.end(twiml.toString());
  }

  // --- Timezone correction (Asia/Karachi) ---
  const userDate = new Date(meetingData.datetime);
  const karachiOffsetMinutes = -300; // UTC+5
  const corrected = new Date(userDate.getTime() - userDate.getTimezoneOffset() * 60000 - karachiOffsetMinutes * 60000);

  // Book meeting with correct timezone
  await bookMeeting(meetingData.name, corrected.toISOString());

  // Format time for Twilio response
  const dateOptions = { year: "numeric", month: "2-digit", day: "2-digit" };
  const timeOptions = { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" };
  const dateStr = corrected.toLocaleDateString("en-US", dateOptions);
  const timeStr = corrected.toLocaleTimeString("en-US", timeOptions);

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(`Ok ${meetingData.name}, I booked your appointment on ${dateStr} at ${timeStr}.`);

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}
