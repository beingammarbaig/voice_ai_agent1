import { google } from "googleapis";

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oAuth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

/**
 * 🗓️ Book a 30-minute Google Calendar meeting (exact local time, no UTC conversion)
 */
export async function bookMeeting(name, dateTime) {
  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

  // ✅ Use the provided dateTime directly (no timezone shifting)
  const startTime = new Date(dateTime);
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // +30 minutes

  const event = {
    summary: `Meeting with ${name}`,
    start: {
      dateTime: dateTime, // Use input as-is
      timeZone: "Asia/Karachi", // Ensure it’s treated as local Karachi time
    },
    end: {
      dateTime: endTime.toISOString().replace("Z", ""), // remove Z (no UTC shift)
      timeZone: "Asia/Karachi",
    },
  };

  try {
    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    console.log(`📅 Meeting created successfully for ${name}`);
    console.log("📆 Start:", startTime.toString());
    console.log("🔗 Google Calendar link:", response.data.htmlLink);
    return response.data.id;
  } catch (err) {
    console.error("❌ Failed to create Google Calendar event:", err.message);
    return null;
  }
}
