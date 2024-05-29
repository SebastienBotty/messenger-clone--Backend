const express = require("express");
const router = express.Router();
const Message = require("../Models/Message");
const Conversation = require("../Models/Conversation");

//-------------------------------POST
router.post("/", async (req, res) => {
  const { author, text, conversationId } = req.body;
  try {
    const message = new Message({
      author: author,
      text: text,
      seenBy: [author],
      date: new Date(),
      conversationId: conversationId,
    });
    const newMessage = await message.save();
    console.log(newMessage._id);
    console.log(")))))");
    const conversation = await Conversation.findByIdAndUpdate(conversationId, {
      $push: { messages: newMessage._id },
    });
    await conversation.save();
    res.status(201).json(newMessage);
    console.log(conversation);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
//-------------------------------GET
//Get X messages of a conversation starting at a given Y index
router.get("/conversationId/:conversationId/getMessages", async (req, res) => {
  const conversationId = req.params.conversationId;
  const start = req.query.start;
  const limit = req.query.limit;
  try {
    const messages = await Message.find({ conversationId: conversationId })
      .sort({ date: -1 })
      .skip(start)
      .limit(limit);
    res.status(200).json(messages);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
module.exports = router;
