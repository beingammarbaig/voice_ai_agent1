// const mongoose = require("mongoose");

// mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ MongoDB connected"));

// const MeetingSchema = new mongoose.Schema({
//   name: String,
//   time: String,
//   callTranscript: String
// });

// module.exports = mongoose.model("Meeting", MeetingSchema);


require('dotenv').config();
const mongoose = require('mongoose');
const Meeting = require('./testModel'); // Import schema

// Get connection string
const uri = process.env.MONGO_URI;

if (!uri) {
  console.error("❌ MONGO_URI missing in .env file");
  process.exit(1);
}

// Connect to MongoDB
mongoose.connect(uri)
  .then(() => {
    console.log("✅ MongoDB connected successfully");

    // Create a test record
    const testMeeting = new Meeting({
      name: "Mirza Muhammad Ammar Baig",
      phone: "+923001234567",
      email: "ammar@example.com",
      date: "2025-10-25",
      time: "3:00 PM"
    });

    // Save to DB
    return testMeeting.save();
  })
  .then(result => {
    console.log("✅ Test document saved:", result);
    return mongoose.connection.close();
  })
  .catch(err => {
    console.error("❌ Error:", err);
  });
