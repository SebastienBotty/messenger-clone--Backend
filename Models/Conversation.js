const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const conversationSchema = Schema({
  members: [{ type: String, require: true }], //Array of usernames
  admin: [{ type: String, require: TextTrackCue }], //Array of username
  messages: [String], // Array of messageId
  date: {
    type: Date,
    require: true,
  }, //Date of conversation creation
});

module.exports = mongoose.model("Conversation", conversationSchema);
