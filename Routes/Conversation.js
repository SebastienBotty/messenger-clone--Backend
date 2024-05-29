const express = require("express");
const router = express.Router();
const Conversation = require("../Models/Conversation");
const Message = require("../Models/Message");

//----------------------POST---------------------------
router.post("/", async (req, res) => {
  const members = req.body.members;
  const isGroupConversation = members.length > 2; //If there is more than 2 members when conversatoin is created, it is flagged as a group Conversation. Then the admin is the one who created the conversation
  const admin = isGroupConversation ? req.body.admin : []; //If there is only 2, there's noe admin
  const conversation = new Conversation({
    isGroupConversation: isGroupConversation,
    members: members,
    admin: admin,
    messages: req.body.messages,
    creationDate: req.body.creationDate,
  });
  try {
    const newConversation = await conversation.save();
    res.status(201).json(newConversation);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

//-------------------------GET-------------------------
router.get("/", async (req, res) => {
  try {
    const conversation = await Conversation.find();
    res.json(conversation);
  } catch (error) {
    res.status(400).json({ mesage: error.message });
  }
});

//Get conversations based on an array of conversationId, return all field except messagesId
router.get("/conversationsId/:conversationsId", async (req, res) => {
  const ids = req.params.conversationsId;
  const conversationsIds = ids.split(",").map((id) => id.trim());

  try {
    const conversations = await Conversation.find({
      _id: {
        $in: conversationsIds.map((id) => id),
      },
    }).select("-messages");

    res.status(200).json(conversations);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// GET conversation last msg
router.get("/conversationId/:conversationId/lastMessage", async (req, res) => {
  const conversationId = req.params.conversationId;
  let lastMsgId;
  try {
    const messagesId = await Conversation.findById(conversationId).select(
      "messages"
    );

    if (messagesId.messages.length > 0) {
      lastMsgId = messagesId.messages[messagesId.messages.length - 1];
      console.log(lastMsgId);

      const lastMessage = await Message.findById(lastMsgId);
      res.status(200).json(lastMessage);
    } else {
      res.status(404).json({ message: "No message in this conversation" });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
