const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const conversationSchema = Schema({
  isGroupConversation: Boolean,
  members: [{ type: String, require: true }], //Array of usernames
  admin: [{ type: String, require: true }], //Array of username
  messages: [String], // Array of messageId
  creationDate: {
    type: Date,
    require: true,
  }, //Date of conversation creation
});

module.exports = mongoose.model("Conversation", conversationSchema);
