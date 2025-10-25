const OpenAI = require("openai");
const twilio = require("twilio");
const { bookMeeting } = require("./calendar");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Step 1: Handle initial call
async function handleCallWebhook(req, res) {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say("Hello! I'm your scheduling assistant. Please tell me what day and time you'd like to book your meeting.");

  // Record and auto-transcribe user’s voice
  twiml.record({
    transcribe: true,
    transcribeCallback: "/process-speech", // Twilio calls this after transcribing
  });

  res.type("text/xml");
  res.send(twiml.toString());
}

// Step 2: Handle Twilio transcription callback
async function processSpeech(req, res) {
  const transcription = req.body.TranscriptionText;
  console.log("🗣 Transcription received:", transcription);

  if (!transcription) {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Sorry, I didn't catch that. Please try again.");
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  // Extract time from user sentence using AI
  const aiResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Extract a clear ISO 8601 date-time string from the user's sentence for scheduling a meeting.",
      },
      { role: "user", content: transcription },
    ],
  });

  const meetingTime = aiResponse.choices[0].message.content.trim();
  console.log("📅 AI Extracted Time:", meetingTime);

  // Book in Google Calendar
  await bookMeeting("User", meetingTime);

  // Reply via Twilio
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(`Great! I have booked your meeting for ${meetingTime}.`);
  res.type("text/xml");
  res.send(twiml.toString());
}

module.exports = { handleCallWebhook, processSpeech };
