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
});

module.exports = mongoose.model("User", userSchema);
