const express = require("express");
const router = express.Router();
const Message = require("../Models/Message");
const Conversation = require("../Models/Conversation");
const User = require("../Models/User");
const { auth, authAdmin } = require("../Middlewares/authentication");
const {
  checkPostMsgBody,
  checkGetMsgBody,
  checkPatchMsgBody,
} = require("../Middlewares/Message");

//-------------------------------POST
router.post("/", auth, checkPostMsgBody, async (req, res) => {
  const { author, authorId, text, date, conversationId } = req.body;

  if (authorId !== req.user.userId) {
    return res
      .status(403)
      .json({ message: "Access denied. You're not who you pretend to be." });
  }
  const convMembers = await Conversation.findById(conversationId).select(
    "members"
  );

  if (!convMembers.members.includes(author)) {
    return res
      .status(403)
      .json({ message: "Access denied. You're not in this conversation." });
  }

  try {
    const message = new Message({
      author: author,
      text: text,
      seenBy: [author],
      date: new Date(date),
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

//Get all messages of a conversation ADMIN
router.get("/getAllMessages", authAdmin, async (req, res) => {
  const convId = req.query.conversationId;
  //console.log(convId)
  try {
    const messages = await Message.find({ conversationId: convId }).sort({ date: -1 });
    res.status(200).json(messages);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
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
        .json({ message: "Access denied. You're not who you pretend to be." });
    }

    const convMembers = await Conversation.findById(conversationId);
    if (!convMembers) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    const user = await User.findById(userId).select("userName deletedConversations");
    if (!convMembers.members.includes(user.userName) && !convMembers.removedMembers.some((member) => member.username === user.userName)) {
      return res
        .status(403)
        .json({ message: "Access denied. You're not in this conversation." });
    }
    let deletedConv = user.deletedConversations.find((conv) => conv.conversationId === conversationId)
    if (deletedConv) {
      try {
        const messages = await Message.find({
          conversationId: conversationId,
          date: { $gte: new Date(deletedConv.deleteDate) },
        })
          .sort({ date: -1 })
          .skip(start)
          .limit(limit);
        return res.status(200).json(messages);

      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
    }

    if (convMembers.removedMembers.some((member) => member.username === user.userName)) {
      try {
        const messages = await Message.find({
          conversationId: conversationId,
          date: { $lte: convMembers.removedMembers.find((member) => member.username === user.userName).date },
        })
          .sort({ date: -1 })
          .skip(start)
          .limit(limit);
        return res.status(200).json(messages);

      } catch (error) {
        return res.status(400).json({ message: error.message });

      }
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

router.get("/userId/:userId/getLastMsgSeenByUser", auth, async (req, res) => {
  const userId = req.params.userId;
  const convId = req.query.conversationId;
  const username = req.query.username;
  if (userId !== req.user.userId) {
    return res
      .status(403)
      .json({ message: "Access denied. You're not who you pretend to be." });
  }
  try {
    const lastMessageSeen = await Message.findOne({
      seenBy: { $in: new RegExp("^" + username + "$", "i") },
      conversationId: convId,
    }).sort({
      date: -1,
    });
    if (!lastMessageSeen) {
      return res.send(false);
    }
    res.status(200).json(lastMessageSeen._id);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

//Get all messages of a conversation containing a given word 

router.get("/userId/:userId/searchMessages", auth, async (req, res) => {
  const userId = req.params.userId;
  const convId = req.query.conversation;
  const word = req.query.word;

  //console.log(userId, convId, word);
  if (userId !== req.user.userId) {
    return res
      .status(403)
      .json({ message: "Access denied. You're not who you pretend to be." });
  }

  if (!word) {
    return res
      .status(400)
      .json({ message: "word is required to search for messages" });
  }

  if (!convId) {
    return res
      .status(400)
      .json({ message: "conversationId is required to search for messages" });
  }

  try {
    const user = await User.findById(userId).select("userName");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const conversation = await Conversation.findById(convId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (!conversation.members.includes(user.userName) && !conversation.removedMembers.some(member => member.username === user.userName)) {
      return res
        .status(403)
        .json({ message: "Access denied. You're not in this conversation." });
    }

    if (conversation.removedMembers.some(member => member.username === user.userName)) {
      const messages = await Message.find({
        conversationId: convId,
        text: { $regex: new RegExp(word, "i") },
        author: { $ne: "System/" + convId },
        date: { $lte: conversation.removedMembers.find(member => member.username === user.userName).date },
      });
      return res.status(200).json(messages);
    }



    const messages = await Message.find({
      conversationId: convId,
      text: { $regex: new RegExp(word, "i") },
      author: { $ne: "System/" + convId },
    });
    res.status(200).json(messages);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}
)

//Get messages before and after a selected messages

router.get("/userId/:userId/getMessagesBeforeAndAfter", auth, async (req, res) => {
  const userId = req.params.userId;
  const messageId = req.query.messageId;
  const conversationId = req.query.conversationId;
  const messages = [[], []];
  if (userId !== req.user.userId) {
    return res
      .status(403)
      .json({ message: "Access denied. You're not who you pretend to be." });
  }
  try {
    const messagesBefore = await Message.find({
      conversationId: conversationId,
      _id: { $lt: messageId },
    })
      .sort({ date: -1 })
      .limit(10);
    messages[0] = messagesBefore;
    const messagesAfter = await Message.find({
      conversationId: conversationId,
      _id: { $gt: messageId },
    })
      .sort({ date: 1 })
      .limit(10);
    messages[1] = messagesAfter;
    res.status(200).json(messages);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

//-------------------------------PATCH

// Patch message, add user to seenBy

router.patch(
  "/userId/:userId/markMessageAsSeen",
  auth,
  checkPatchMsgBody,
  async (req, res) => {
    const userId = req.params.userId;
    const messageId = req.body.messageId;
    const username = req.body.username;

    if (userId !== req.user.userId) {
      return res
        .status(403)
        .json({ message: "Access denied. You're not who you pretend to be." });
    }
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }

      if (!message.seenBy.includes(username)) {
        message.seenBy.push(username);
        await message.save();
        return res.status(200).json(message);
      }
      res.json({ message: "Message already seen" });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);
module.exports = router;
