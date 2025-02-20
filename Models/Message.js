const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const messageSchema = Schema({
  author: {
    //Username of message sender
    type: String,
    require: true,
  },
  authorId: {
    type: String,
    require: true
  },
  text: [{              //Message content, contains differents versions of modified msg

    type: String,
    require: true,
  }],
  seenBy: [String], //Array of people's userName who saw this msg
  deletedBy: [{
    username: String,
    userId: String
  }],
  deletedForEveryone: {
    type: Boolean,
    default: false
  },
  deletedForEveryoneDate: {
    type: Date,
    default: null,
  },
  date: {
    //Date when message has been sent
    type: Date,
    require: true,
  },
  conversationId: String,
  reactions: [{
    userId: String,
    username: String,
    reaction: String
  }],
  responseToMsgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Messages",
    default: null,
  },
});

module.exports = mongoose.model("Messages", messageSchema);
