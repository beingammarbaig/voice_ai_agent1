const { google } = require("googleapis");

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

async function bookMeeting(name, time) {
  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });
  const event = {
    summary: `Meeting with ${name}`,
    start: { dateTime: new Date(time).toISOString(), timeZone: "Asia/Karachi" },
    end: { dateTime: new Date(new Date(time).getTime() + 30 * 60000).toISOString(), timeZone: "Asia/Karachi" },
  };
  const response = await calendar.events.insert({ calendarId: "primary", resource: event });
  console.log("📅 Meeting created:", response.data.htmlLink);
}

module.exports = { bookMeeting };
