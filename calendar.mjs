import { google } from "googleapis";

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

export async function bookMeeting(name, time) {
  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });
  const start = new Date(time);
  const end = new Date(start.getTime() + 30 * 60 * 1000); // +30 minutes
  const timeZone = "Asia/Karachi";

  const event = {
    summary: `Meeting with ${name}`,
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
  };

  const response = await calendar.events.insert({
    calendarId: "primary",
    resource: event,
  });

  console.log("📅 Meeting created:", response.data.htmlLink);
}
