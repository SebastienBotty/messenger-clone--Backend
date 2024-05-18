const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const messageSchema = Schema({
  author: {
    //Username of message sender
    type: String,
    require: true,
  },
  text: {
    //Message content
    type: String,
    require: true,
  },
  seenBy: [String], //Array of people's userName who saw this msg
  date: {
    //Date when message has been sent
    type: String,
    require: true,
  },
});

module.exports = mongoose.model("Messages", messageSchema);
