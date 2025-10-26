import { google } from "googleapis";

// 🔐 Google API Setup
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oAuth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

/**
 * 📅 Create 30-minute Google Calendar event using exact provided datetime
 */
export async function bookMeeting(name, meetingTime) {
  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

  const startTime = new Date(meetingTime);
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // +30 minutes

  const event = {
    summary: `Meeting with ${name}`,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: "Asia/Karachi",
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: "Asia/Karachi",
    },
  };

  try {
    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });
    console.log(`📅 Meeting created successfully for ${name}`);
    console.log("🔗 Google Calendar link:", response.data.htmlLink);
  } catch (err) {
    console.error("❌ Failed to create Google Calendar event:", err.message);
  }
}
