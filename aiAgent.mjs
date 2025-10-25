import twilio from "twilio";
import { GoogleGenAI } from "@google/genai";
import { bookMeeting } from "./calendar.mjs";

// Initialize the Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = "gemini-2.5-flash";

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

  // Define a JSON schema for Gemini to return
  const schema = {
    type: "object",
    properties: {
      name: { type: "string" },
      datetime: { type: "string", description: "ISO 8601 format" }
    },
    required: ["name", "datetime"],
  };

  let meetingData;

  try {
    // Gemini structured call
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `
Extract the person's full name and the meeting datetime from the text below.
Text: "${transcription}"
`,
      config: {
        temperature: 0,
        maxOutputTokens: 200,
        response_mime_type: "application/json",
        response_schema: schema,
        current_datetime: new Date().toISOString(), // send current date for "tomorrow" logic
      },
    });

    // Parse structured response
    if (response.parsed) {
      meetingData = response.parsed;
    }

    if (!meetingData?.name || !meetingData?.datetime) {
      console.warn("❌ Gemini did not return valid data. No meeting will be created.");
      return res.status(200).send("Could not extract meeting info.");
    }

    console.log(`✅ Extracted Name: ${meetingData.name}`);
    console.log(`✅ Extracted Datetime: ${meetingData.datetime}`);

  } catch (err) {
    console.error("❌ Data extraction failed:", err.message);
    return res.status(200).send("Could not extract meeting info.");
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
