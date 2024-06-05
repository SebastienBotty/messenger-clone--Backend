const express = require("express");
const router = express.Router();
const Conversation = require("../Models/Conversation");
const Message = require("../Models/Message");
const User = require("../Models/User");
const { auth, authAdmin } = require("../Middlewares/authentication");
const checkPostConvBody = require("../Middlewares/Conversation");

//----------------------POST---------------------------
router.post("/", auth, checkPostConvBody, async (req, res) => {
  const members = req.body.members;
  const creationDate = req.body.creationDate;
  const admin = req.body.admin;

  const user = await User.findOne({ userName: admin }).select("_id");
  if (!user) {
    return res.status(400).send("User not found");
  }
  if (String(user._id) !== req.user.userId) {
    return res
      .status(403)
      .send("You can't create a conversation for someone else");
  }

  const isGroupConversation = members.length > 2; //If there is more than 2 members when conversatoin is created, it is flagged as a group Conversation. Then the admin is the one who created the conversation
  //const admin = isGroupConversation ? req.body.admin : []; //If there is only 2, there's noe admin
  const conversation = new Conversation({
    isGroupConversation: isGroupConversation,
    members: members,
    admin: admin,
    messages: [],
    creationDate: creationDate,
  });
  try {
    const newConversation = await conversation.save();
    for (let member of members) {
      const user = await User.findOne({
        userName: new RegExp("^" + member + "$", "i"),
      });
      if (user) {
        user.conversations.push(newConversation._id);
        await user.save();
      }
    }

    res.status(201).json(newConversation);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

//-------------------------GET-------------------------
router.get("/", authAdmin, async (req, res) => {
  try {
    const conversation = await Conversation.find();
    res.json(conversation);
  } catch (error) {
    res.status(400).json({ mesage: error.message });
  }
});

//Get conversations based on an array of conversationId, return all field except messagesId
router.get("/userId/:userId/getConversations?", auth, async (req, res) => {
  const userId = req.params.userId;
  const ids = req.query.conversationsId;
  const conversationsIds = ids.split("-").map((id) => id.trim());

  if (req.user.userId !== userId) {
    return res.status(403).send("Access denied.");
  }
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
router.get(
  "/userId/:userId/conversation/lastMessage?",
  auth,
  async (req, res) => {
    const userId = req.params.userId;
    const conversationId = req.query.conversationId;
    let lastMsgId;

    if (req.user.userId !== userId) {
      return res.status(403).send("Access denied.");
    }
    try {
      const messagesId = await Conversation.findById(conversationId).select(
        "messages"
      );

      if (messagesId.messages.length > 0) {
        lastMsgId = messagesId.messages[messagesId.messages.length - 1];

        const lastMessage = await Message.findById(lastMsgId);
        res.status(200).json(lastMessage);
      } else {
        res.status(404).json({ message: "No message in this conversation" });
      }
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);

/*Check if user already have a private conversation with another user 
Receive a userId,recipient's username. 
Gets user's conversations field then gets all the conversations within the field
Check in all conversations if one of them is not a groupConversation and members are just his recipient and him*/

router.get("/userId/:userId/privateConversation?", auth, async (req, res) => {
  const userId = req.params.userId;
  const username = req.query.username;
  const recipientUsername = req.query.recipient;
  console.log(userId, username, recipientUsername);

  if (userId !== req.user.userId) {
    return res
      .status(403)
      .send("Access denied. You're not who you pretend to be.");
  }
  try {
    const user = await User.findOne({
      userName: new RegExp("^" + username, "i"),
    });
    const conversationsId = user.conversations;
    for (const conversationId of conversationsId) {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation.isGroupConversation) {
        if (
          conversation.members.includes(username) &&
          conversation.members.includes(recipientUsername)
        ) {
          return res.json(conversation);
        }
      }
    }
    res.json(false);
  } catch (error) {
    res.status(400).json({ mesage: error.message });
  }
});

module.exports = router;
