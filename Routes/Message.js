const express = require("express");
const router = express.Router();
const { getIo } = require('../Config/Socket')
const Message = require("../Models/Message");
const DeletedMessage = require("../Models/DeletedMessage");
const Conversation = require("../Models/Conversation");
const User = require("../Models/User");
const { auth, authAdmin } = require("../Middlewares/authentication");
const {
  checkPostMsgBody,
  checkGetMsgBody,
  checkPatchMsgBody,
} = require("../Middlewares/Message");
const { emitDeletedMsgToUsers, emitChangeReactionToUsers, emitEditedMsgToUsers } = require("../Utils/SocketUtils");
const { getUsersSocketId } = require("../Services/User")


//-------------------------------POST
router.post("/", auth, checkPostMsgBody, async (req, res) => {
  const { author, authorId, text, date, conversationId, responseToMsgId } = req.body;

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
      authorId: authorId,
      text: text,
      seenBy: [author],
      date: new Date(date),
      conversationId: conversationId,
      deletedBy: [],
      deletedForEveryone: false,
      reactions: [],
      responseToMsgId: responseToMsgId || null
    });
    const newMessage = await message.save();
    const conversation = await Conversation.findByIdAndUpdate(conversationId, {
      $push: { messages: newMessage._id },
    });
    await conversation.save();
    await newMessage.populate({
      path: "responseToMsgId",
      select: "author authorId text date ",
    })
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
    const deletedConversation = user.deletedConversations.find((conv) => conv.conversationId === conversationId)
    const removedMember = convMembers.removedMembers.find((member) => member.username === user.userName)



    try {
      const messages = await Message.find({
        conversationId: conversationId,
        date: {
          $gte: new Date(deletedConversation?.deleteDate || 0),
          ...(removedMember ? { $lte: new Date(removedMember.date) } : {})
        },
        deletedBy: {
          $not: {
            $elemMatch: { username: user.userName }
          }
        }
      })
        .sort({ date: -1 })
        .skip(start)
        .limit(limit)
        .populate({
          path: "responseToMsgId",
          select: "author authorId text date ",
        })

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
    const user = await User.findById(userId).select("userName deletedConversations");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const conversation = await Conversation.findById(convId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    const deletedConversation = user.deletedConversations.find(conv => conv.conversationId === convId);
    const removedMember = conversation.removedMembers.find(member => member.username === user.userName);

    if (!conversation.members.includes(user.userName) && !removedMember) {
      return res
        .status(403)
        .json({ message: "Access denied. You're not in this conversation." });
    }

    const messages = await Message.find({
      conversationId: convId,
      $expr: {
        $regexMatch: {
          input: { $arrayElemAt: ["$text", -1] },
          regex: new RegExp(word, "i")
        }
      },
      author: { $ne: "System/" + convId },
      date: {
        $gte: new Date(deletedConversation?.deleteDate || 0),
        ...(removedMember ? { $lte: new Date(removedMember.date) } : {})
      },
      deletedForEveryone: false,
      deletedBy: {
        $not: {
          $elemMatch: { username: user.userName }
        }
      }
    });
    console.log(messages);
    return res.status(200).json(messages);

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
      .limit(10)
      .populate({
        path: "responseToMsgId",
        select: "author authorId text date ",
      })
    messages[0] = messagesBefore;
    const messagesAfter = await Message.find({
      conversationId: conversationId,
      _id: { $gt: messageId },
    })
      .sort({ date: 1 })
      .limit(10)
      .populate({
        path: "responseToMsgId",
        select: "author authorId text date ",
      })
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


//Patch message deletedBy => Add a user to deletedBy arr 

router.patch("/userId/:userId/markMessageAsDeletedByUser", auth, async (req, res) => {
  const userId = req.params.userId;
  const messageId = req.body.messageId;
  const username = req.body.username;
  console.log(userId, messageId, username)
  console.log("1")
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

    if (message.deletedBy.find((user) => user.userId === userId)) {
      return res.status(400).json({ message: "Message already deleted" });
    }

    const conversation = await Conversation.findById(message.conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    if (!conversation.members.includes(username) && !conversation.removedMembers.find(member => member.username === username)) {
      return res
        .status(403)
        .json({ message: "Access denied. You're not in this conversation." });
    }

    message.deletedBy.push({ userId: userId, username: username });
    await message.save();
    return res.status(200).json({ message: "Message successfully deleted for user" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

//PATCH message deletedForEveryone => put the field to true 

router.patch("/userId/:userId/markMessageAsDeletedForEveryone", auth, async (req, res) => {
  const userId = req.params.userId;
  const messageId = req.body.messageId;
  const username = req.body.username;
  console.log(userId, messageId, username)
  console.log("1")
  if (userId !== req.user.userId) {
    return res
      .status(403)
      .json({ message: "Access denied. You're not who you pretend to be." });
  }

  const session = await Conversation.startSession();

  try {
    session.startTransaction();
    const message = await Message.findById(messageId).session(session);
    if (!message) {
      throw new Error("Message not found")
    }

    if (message.author !== username) {
      throw new Error("Access denied. You're not who you pretend to be.")
    }
    if (message.deletedForEveryone) {
      throw new Error("Message already deleted")
    }

    const conversation = await Conversation.findById(message.conversationId).session(session);
    if (!conversation) {
      throw new Error("Conversation not found")
    }
    if (!conversation.members.includes(username)) {
      throw new Error("Access denied. You're not in this conversation.")
    }


    const newDeletedMsg = new DeletedMessage({
      messageId: message._id,
      author: message.author,
      text: [...message.text],
      seenBy: message.seenBy,
      deletedBy: message.deletedBy,
      deletedForEveryone: true,
      date: message.date,
      deletedDate: new Date(),
      reactions: message.reactions,
    })
    await newDeletedMsg.save({ session });

    message.deletedForEveryone = true;
    message.deletedForEveryoneDate = new Date();
    message.text = ["Ce message a été supprimé"]
    const msg = await message.save({ session });

    const usersTosend = [...conversation.members.filter(member => member !== username)] // remove the user who sent the request// Olg bug i still dont understand
    const socketsIds = await getUsersSocketId(usersTosend);
    emitDeletedMsgToUsers(getIo(), socketsIds, msg, conversation._id);

    await session.commitTransaction();
    res.status(200).json({ message: "Message successfully deleted" });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
});

//Patch reactions add => Add/modifies/removes a user to reactions arr
router.patch("/changeReaction", auth, async (req, res) => {
  const userId = req.body.userId;
  const messageId = req.body.messageId;
  const username = req.body.username;
  const reaction = req.body.reaction;
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
    const conversation = await Conversation.findById(message.conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    if (!conversation.members.includes(username)) {
      return res
        .status(403)
        .json({ message: "Access denied. You're not in this conversation." });
    }

    const index = message.reactions.findIndex((user) => user.userId === userId);
    if (index === -1) {
      message.reactions.push({ userId: userId, username: username, reaction: reaction });
    } else {
      message.reactions[index].reaction = reaction;
    }
    await message.save();
    res.status(200).json({ message: "Reaction successfully updated", data: message.reactions });
    const usersTosend = [...conversation.members.filter(member => member !== username)] // remove the user who sent the request// Olg bug i still dont understand
    const socketsIds = await getUsersSocketId(usersTosend);
    emitChangeReactionToUsers(getIo(), socketsIds, message.reactions, message._id, conversation._id);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
})

//Patch remove reaction => Remove a user from reactions arr
router.patch("/removeReaction", auth, async (req, res) => {
  const userId = req.body.userId;
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
    const conversation = await Conversation.findById(message.conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    if (!conversation.members.includes(username)) {
      return res
        .status(403)
        .json({ message: "Access denied. You're not in this conversation." });
    }

    message.reactions = message.reactions.filter((user) => user.userId !== userId);

    await message.save();
    res.status(200).json({ message: "Reaction successfully deleted", data: message.reactions });

    const usersTosend = [...conversation.members.filter(member => member !== username)] // remove the user who sent the request// Olg bug i still dont understand
    const socketsIds = await getUsersSocketId(usersTosend);
    emitChangeReactionToUsers(getIo(), socketsIds, message.reactions, message._id, conversation._id);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
})


//PATCH : edit msg text 

router.patch('/editMessage', auth, async (req, res) => {

  const { userId, messageId, username, text, conversationId } = req.body
  if (userId !== req.user.userId) {
    return res
      .status(403)
      .json({ message: "Access denied. You're not who you pretend to be." });
  }
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    if (!conversation.members.includes(username)) {
      return res
        .status(403)
        .json({ message: "Access denied. You're not in this conversation." });
    }
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }
    if (message.author !== username) {
      return res.status(403).json({ message: "Access denied. You're not the message author." });
    }

    message.text = [...message.text, text];
    await message.save();
    res.status(200).json(message);
    const usersTosend = [...conversation.members.filter(member => member !== username)] // remove the user who sent the request// Olg bug i still dont understand
    const socketsIds = await getUsersSocketId(usersTosend);
    emitEditedMsgToUsers(getIo(), socketsIds, message);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
})
module.exports = router;
