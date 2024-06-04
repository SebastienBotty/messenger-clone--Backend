const express = require("express");
const router = express.Router();
const Message = require("../Models/Message");
const Conversation = require("../Models/Conversation");
const User = require("../Models/User");
const { auth, authAdmin } = require("../Middlewares/authentication");
const { checkPostMsgBody, checkGetMsgBody } = require("../Middlewares/Message");

//-------------------------------POST
router.post("/", auth, checkPostMsgBody, async (req, res) => {
  const { author, authorId, text, date, conversationId } = req.body;

  if (authorId !== req.user.userId) {
    return res
      .status(403)
      .send("Access denied. You're not who you pretend to be.");
  }
  const convMembers = await Conversation.findById(conversationId).select(
    "members"
  );

  if (!convMembers.members.includes(author)) {
    return res
      .status(403)
      .send("Access denied. You're not in this conversation.");
  }

  try {
    const message = new Message({
      author: author,
      text: text,
      seenBy: [author],
      date: date,
      conversationId: conversationId,
    });
    const newMessage = await message.save();
    const conversation = await Conversation.findByIdAndUpdate(conversationId, {
      $push: { messages: newMessage._id },
    });
    await conversation.save();
    res.status(201).json(newMessage);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
//-------------------------------GET
//Get X messages of a conversation starting at a given Y index
router.get(
  "/userId/:userId/getMessages",
  auth,
  checkGetMsgBody,
  async (req, res) => {
    const userId = req.params.userId;
    const conversationId = req.query.conversationId;
    const start = req.query.start;
    const limit = req.query.limit;

    if (userId !== req.user.userId) {
      return res
        .status(403)
        .send("Access denied. You're not who you pretend to be.");
    }

    const convMembers = await Conversation.findById(conversationId);
    if (!convMembers) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    const user = await User.findById(userId).select("userName");
    if (!convMembers.members.includes(user.userName)) {
      return res
        .status(403)
        .send("Access denied. You're not in this conversation.");
    }

    try {
      const messages = await Message.find({ conversationId: conversationId })
        .sort({ date: -1 })
        .skip(start)
        .limit(limit);
      res.status(200).json(messages);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);
module.exports = router;
