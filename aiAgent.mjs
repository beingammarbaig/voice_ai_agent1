// aiAgent.mjs
import twilio from "twilio";
import { GoogleGenAI } from "@google/genai";
import { bookMeeting } from "./calendar.mjs";

// Initialize the Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY, // Set this in your Vercel environment
});

const GEMINI_MODEL = "gemini-2.5-flash"; // Specify your Gemini model

/**
 * Calls Gemini to extract structured data (name and datetime)
 * @param {string} prompt
 * @returns {Promise<string>} - raw JSON text from Gemini
 */
async function callGemini(prompt) {
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { temperature: 0, maxOutputTokens: 200 },
    });

    // Gemini now returns candidates array
    let text = "";
    if (response.text) {
      text = response.text || "";
    }

    if (!text) {
      throw new Error("Gemini response missing content");
    }

    return text;
  } catch (error) {
    throw new Error(`Gemini API call failed: ${error.message}`);
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
  const transcription = req.body.TranscriptionText || "User did not speak";
  console.log("🗣 Transcription received:", transcription);

  const PROMPT_INSTRUCTION = `
You are a data extraction assistant.
Extract the person's full name and the meeting datetime from the text below.

Output MUST be a single, valid JSON object:
{
  "name": "Full Name",
  "datetime": "YYYY-MM-DDTHH:MM:SS"
}

Text:
"${transcription}"
`;

  let meetingData;

  try {
    const geminiOutput = await callGemini(PROMPT_INSTRUCTION);

    // Clean and parse the JSON
    const cleanedOutput = geminiOutput.trim().replace(/^```json\s*|```\s*$/g, "");
    console.log("🤖 Gemini raw output:", geminiOutput);
    console.log("🧹 Cleaned JSON:", cleanedOutput);

    meetingData = JSON.parse(cleanedOutput);

    if (!meetingData.name || !meetingData.datetime) {
      throw new Error("Missing 'name' or 'datetime' field in Gemini output");
    }

    console.log(`✅ Extracted Name: ${meetingData.name}`);
    console.log(`✅ Extracted Datetime: ${meetingData.datetime}`);
  } catch (err) {
    console.error("❌ Data extraction or parsing failed, using fallback:", err.message);
    meetingData = {
      name: "Fallback User",
      datetime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  // Book the meeting
  await bookMeeting(meetingData.name, meetingData.datetime);

  // Respond via Twilio
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(
    `Great! I have booked your meeting with ${meetingData.name} for ${meetingData.datetime}.`
  );
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}
