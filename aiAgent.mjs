// aiAgent.mjs
import twilio from "twilio";
import { GoogleGenAI } from "@google/genai";
import { bookMeeting } from "./calendar.mjs";

// Initialize Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY, // Set in environment
});

const GEMINI_MODEL = "gemini-2.5-flash";

/**
 * Calls Gemini to extract structured data (name and datetime)
 * @param {string} prompt
 * @param {string} currentDate - ISO string of today's date for context
 * @returns {Promise<{name: string, datetime: string} | null>}
 */
async function callGemini(prompt, currentDate) {
  try {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        datetime: { type: "string" },
      },
      required: ["name", "datetime"],
    };

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `${prompt}\n\nCurrent date: ${currentDate}`,
      config: {
        response_mime_type: "application/json",
        response_schema: schema,
        temperature: 0,
        maxOutputTokens: 200,
      },
    });

    if (!response.parsed) {
      console.warn("❌ Gemini returned no parsed data");
      return null;
    }

    return response.parsed;
  } catch (error) {
    console.error("❌ Gemini API call failed:", error.message);
    return null;
  }
}

// Step 1: Handle initial call
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

// Step 2: Handle Twilio transcription callback
export async function processSpeech(req, res) {
  const transcription = req.body.TranscriptionText || "";
  console.log("🗣 Transcription received:", transcription);

  if (!transcription.trim()) {
    console.log("❌ No user speech detected. No meeting created.");
    return res.status(200).send("No transcription detected.");
  }

  const PROMPT_INSTRUCTION = `
You are a data extraction assistant.
Extract the person's full name and the meeting datetime from the text below.
Output MUST be a JSON object with fields: { "name": string, "datetime": ISO8601 datetime }.
If the user mentions relative days like "tomorrow" or "day after tomorrow", calculate the correct date based on the current date.
Text:
"${transcription}"
`;

  // Send current date to Gemini
  const currentDate = new Date().toISOString();

  let meetingData = await callGemini(PROMPT_INSTRUCTION, currentDate);

  if (!meetingData || !meetingData.name || !meetingData.datetime) {
    console.log(
      "❌ Data extraction failed or incomplete. No meeting will be created."
    );
    return res.status(200).send("Could not extract meeting data.");
  }

  console.log(`✅ Extracted Name: ${meetingData.name}`);
  console.log(`✅ Extracted Datetime: ${meetingData.datetime}`);

  try {
    await bookMeeting(meetingData.name, meetingData.datetime);
  } catch (err) {
    console.error("❌ Failed to book meeting:", err.message);
    return res.status(500).send("Failed to book meeting.");
  }

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(
    `Great! I have booked your meeting with ${meetingData.name} for ${meetingData.datetime}.`
  );
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}
