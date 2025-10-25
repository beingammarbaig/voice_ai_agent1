const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
  date: String,
  time: String
});

module.exports = mongoose.model('Meeting', meetingSchema);
