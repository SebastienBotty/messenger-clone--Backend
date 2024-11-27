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
  removedMembers: [{
    username: {
      type: String,
      require: true
    },
    date: {
      type: Date,
      require: true
    }
  }],
  mutedBy: [{
    userId: {
      type: String,
      require: true
    },
    untilDate: {
      type: Date,
      require: true
    }
  }],
  customization: {
    conversationName: {
      type: String,
      default: ""
    },
    photo: {
      type: String,
      default: ""
    },
    theme: {
      type: String,
      default: "#0084ff"
    },
    emoji: {
      type: String,
      default: "👍"
    }


  }

});

module.exports = mongoose.model("Conversation", conversationSchema);
