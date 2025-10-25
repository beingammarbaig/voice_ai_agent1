// aiAgent.mjs
import twilio from "twilio";
import axios from "axios";
import { bookMeeting } from "./calendar.mjs";

// Gemini API function
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function callGemini(prompt) {
  const url = "https://generativeai.googleapis.com/v1beta2/models/text-bison-001:generateText";

  const response = await axios.post(
    url,
    {
      prompt: { text: prompt },
      temperature: 0,
      maxOutputTokens: 200
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GEMINI_API_KEY}`
      }
    }
  );

  return response.data?.candidates?.[0]?.content || "";
}

// Step 1: Handle initial call
export async function handleCallWebhook(req, res) {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say(
    "Hello! I'm your scheduling assistant. Please tell me the name of the person and what day and time you'd like to book your meeting."
  );

  // Record and auto-transcribe user’s voice
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

  // Use Gemini AI to extract name and datetime
  const prompt = `
Extract the person's name and meeting datetime from this text:
"${transcription}"

Return a JSON object like:
{ "name": "Person Name", "datetime": "YYYY-MM-DDTHH:MM:SS" }
`;

  let meetingData;
  try {
    const geminiOutput = await callGemini(prompt);
    console.log("🤖 Gemini output:", geminiOutput);
    meetingData = JSON.parse(geminiOutput);
  } catch (err) {
    console.error("❌ Gemini parsing failed, using fallback:", err);
    // Fallback
    meetingData = {
      name: "User",
      datetime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
  }

  // Book in Google Calendar
  await bookMeeting(meetingData.name, meetingData.datetime);

  // Reply via Twilio
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(`Great! I have booked your meeting with ${meetingData.name} for ${meetingData.datetime}.`);
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}
