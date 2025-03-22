const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userSchema = Schema({
  mail: {
    type: String,
    unique: true,
    required: true,
  },
  userName: {
    type: String,
    unique: true,
    required: true,
  },
  socketId: {
    type: String,
  },
  photo: {
    type: String,
  },
  conversations: [String], // Array of ConversationId
  mutedConversations: [{
    conversationId: String,
    untilDate: Date
  }],
  deletedConversations: [{
    conversationId: String,
    deleteDate: Date
  }],
  isOnline: {
    type: Boolean,
    default: true
  },
  lastSeen: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ["Online", "Offline", "Busy"],
    default: "Online"
  },
  blockedUsers: [String], // Array of userId
  blockedByUsers: [String]
});

module.exports = mongoose.model("User", userSchema);
