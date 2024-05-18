const express = require("express");
const router = express.Router();
const Conversation = require("../Models/Conversation");

//-------------------------GET-------------------------
router.get("/", async (req, res) => {
  try {
    const conversation = await Conversation.find();
    res.json(conversation);
  } catch (error) {
    res.status(400).json({ mesage: error.message });
  }
});

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

module.exports = router;
