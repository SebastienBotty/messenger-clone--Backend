const express = require("express");
const router = express.Router();
const Conversation = require("../Models/Conversation");
const Message = require("../Models/Message");
const User = require("../Models/User");
const { auth, authAdmin } = require("../Middlewares/authentication");
const checkPostConvBody = require("../Middlewares/Conversation");

const { getIo } = require('../Socket') // Importer le serveur Socket.IO initialisé
const { emitConvUpdateToUsers, getUsersSocketId } = require('../SocketUtils');


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
    admin: isGroupConversation ? [admin] : members,
    messages: [],
    creationDate: creationDate,
    removedMembers: [],
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

//-------------------------GET--------------------------------------------------------------------
//Get all conversations
router.get("/", authAdmin, async (req, res) => {
  try {
    const conversation = await Conversation.find();
    res.json(conversation);
  } catch (error) {
    res.status(400).json({ mesage: error.message });
  }
});

// Get any conversation based on its ID (admin)

router.get("/:conversationId", authAdmin, async (req, res) => {
  const conversationId = req.params.conversationId;
  try {
    const conversation = await Conversation.findById(conversationId).select('-messages');
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
      const username = await User.findById(userId).select("userName");
      if (!username) {
        return res.status(404).json({ message: "User not found" });
      }
      const conversation = await Conversation.findById(conversationId)

      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (!conversation.members.includes(username.userName) && !conversation.removedMembers.some(member => member.username === username.userName)) {
        return res
          .status(403)
          .json({ message: "Access denied. You're not in this conversation." });
      }
      if (conversation.removedMembers.some(member => member.username === username.userName)) {
        console.log("2")
        const lastMessage = await Message.findOne({
          conversationId: conversationId,
          date: conversation.removedMembers.find(member => member.username === username.userName).date,
          author: "System/" + conversationId,
        });
        if (!lastMessage) {
          return res.status(404).json({ message: "No message in this conversation" });
        }
        return res.status(200).json(lastMessage);
      }
      const messagesId = conversation.messages
      if (messagesId.length > 0) {
        lastMsgId = messagesId[messagesId.length - 1];

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

//Find all conversations that has specific members in it (the user + the recipient)

router.get('/userId/:userId/conversationsWith?', auth, async (req, res) => {
  const userId = req.params.userId;
  const members = req.query.members ? req.query.members.split(',') : [];
  const user = req.query.user ? req.query.user : '';

  if (!user) {
    return res.status(400).json({ message: "User query parameter is required and must not be empty." });
  }
  if (!members.length) {
    return res.status(400).json({ message: "Members query parameter is required and must not be empty." });
  }
  if (userId !== req.user.userId) {
    return res
      .status(403)
      .send("Access denied. You're not who you pretend to be.");
  }

  const regexMembers = members.map(member => new RegExp(member, "i"));
  const regexUser = new RegExp(user, "i");

  try {
    const conversations = await Conversation.find({
      members: { $all: [...regexMembers, regexUser] },
    }).select("-messages")
    console.log("iciXXXXXXXXXXXXXX")
    let test = []
    if (conversations) {
      for (let conversation of conversations) {
        try {
          const messagesId = await Conversation.findById(conversation._id).select(
            "messages"
          );

          if (messagesId.messages.length > 0) {
            lastMsgId = messagesId.messages[messagesId.messages.length - 1];

            const lastMessage = await Message.findById(lastMsgId);
            test.push({ ...conversation.toObject(), lastMessage: lastMessage, photo: "" })
            //console.log(test)
          }

        }
        catch (error) {
          res.status(400).json({ message: error.message });
        }
        //console.log(conversation)
      }
    }

    res.status(200).json(test);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
})


//-------------------------PATCH

//PATCH CONV MEMBERS -  Add a user to a grup onversation 

router.patch("/addMembers", auth, async (req, res) => {
  const { conversationId, adderUsername, adderUserId, addedUsers, date } = req.body;
  console.log(req.body)

  if (!conversationId || !adderUsername || !adderUserId || !addedUsers || !addedUsers.length || !date) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (req.user.userId !== adderUserId) {
    return res.status(401).json({ message: "Access denied." });
  }

  const session = await Conversation.startSession();

  try {
    session.startTransaction();
    const conversation = await Conversation.findById(conversationId).session(session);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    if (!conversation.isGroupConversation) {
      throw new Error("You can't add a user to a private conversation");
    }

    const message = new Message({
      conversationId: conversationId,
      author: "System/" + conversationId,
      text: `${adderUsername}-addUser-${addedUsers.map(user => user.userName).join(",")}`,
      seenBy: [adderUsername],
      date: new Date(date),
    })
    const newMessage = await message.save({ session });
    for (const addedUser of addedUsers) {
      const addedUsername = addedUser.userName;
      const addedUserId = addedUser._id;

      if (!addedUsername || !addedUserId) {
        throw new Error("All fields of addedUsers are required");
      }

      const user = await User.findById(addedUserId).session(session);
      if (!user) {
        throw new Error(`User not found: ${addedUsername}`);
      }
      if (user.userName !== addedUsername) {
        throw new Error(`Username/userId does not match: ${addedUsername}`);
      }

      if (!user.conversations.includes(conversationId)) {
        user.conversations.push(conversationId);
        await user.save({ session });
      }


      if (!conversation.admin.includes(adderUsername)) {
        throw new Error("You are not the admin of this conversation:");
      }
      if (conversation.members.includes(addedUsername)) {
        throw new Error(`User already in the conversation: ${addedUsername}`);
      }

      if (conversation.removedMembers.some(member => member.username === addedUsername)) {
        console.log("here")
        console.log(conversation.removedMembers)
        conversation.removedMembers = conversation.removedMembers.filter(member => member.username !== addedUsername)
      }

      conversation.members.push(addedUsername);
    }
    conversation.messages.push(newMessage._id);
    await conversation.save({ session });
    const conversationObj = conversation.toObject();
    delete conversationObj.messages;
    const usersTosend = [...conversation.members.filter(member => member !== adderUsername)] // remove the user who sent the request// !! Read commit message !
    const socketsIds = await getUsersSocketId(usersTosend);
    conversationObj.lastMessage = newMessage
    emitConvUpdateToUsers(getIo(), socketsIds, conversationObj);
    await session.commitTransaction();
    res.status(200).json({ conversation: conversationObj, message: newMessage });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
});


//PATCH CONV MEMBERS -  Remove a user from a group conversation
router.patch("/removeUser", auth, async (req, res) => {
  const { conversationId, removerUsername, removerUserId, removedUsername, date } = req.body;

  if (!conversationId || !removerUsername || !removerUserId || !removedUsername || !date) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (req.user.userId !== removerUserId) {
    return res.status(403).json({ message: "Access denied." });
  }

  const session = await Conversation.startSession();

  try {
    session.startTransaction();


    const conversation = await Conversation.findById(conversationId).session(session);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    if (!conversation.admin.includes(removerUsername)) {
      throw new Error("You are not the admin of this conversation");
    }
    if (conversation.admin.includes(removedUsername)) {
      throw new Error("You can't remove an admin of the conversation");
    }
    if (!conversation.members.includes(removedUsername)) {
      throw new Error("User is not in the conversation");
    }
    if (!conversation.isGroupConversation) {
      throw new Error("You can't remove a user from a private conversation");
    }

    conversation.members = conversation.members.filter(member => member !== removedUsername);
    conversation.removedMembers.push({ username: removedUsername, date: new Date(date) });
    await conversation.save({ session });


    const message = new Message({
      conversationId: conversationId,
      author: "System/" + conversationId,
      text: `${removerUsername}-removeUser-${removedUsername}`,
      seenBy: [removerUsername],
      date: new Date(date),
    })

    const newMessage = await message.save({ session });
    conversation.messages.push(newMessage._id);
    await conversation.save({ session });
    const conversationObj = conversation.toObject();
    delete conversationObj.messages;

    const usersTosend = [...conversation.members.filter(member => member !== removerUsername), removedUsername] // remove the user who sent the request// !! Read commit message !
    const socketsIds = await getUsersSocketId(usersTosend);
    conversationObj.lastMessage = newMessage
    emitConvUpdateToUsers(getIo(), socketsIds, conversationObj);
    await session.commitTransaction();
    res.status(200).json({ conversation: conversationObj, message: newMessage });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
});

// PATCH CONV MEMBERS - Users leaves group conversation
router.patch("/leaveConversation", auth, async (req, res) => {
  const { conversationId, username, userId, date } = req.body;
  console.log(req.body)
  if (!conversationId || !username || !userId || !date) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (req.user.userId !== userId) {
    return res.status(403).send("Access denied.");
  }

  const session = await Conversation.startSession();

  try {
    session.startTransaction();

    const conversation = await Conversation.findById(conversationId).session(session);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    if (!conversation.isGroupConversation) {
      throw new Error("You can't leave a private conversation");
    }

    if (conversation.admin.includes(username)) {
      if (conversation.admin.length === 1) {
        throw new Error("Conversation must have at least one admin");
      }
      conversation.admin = conversation.admin.filter(admin => admin !== username);
    }
    if (!conversation.members.includes(username)) {
      throw new Error("User is not in the conversation");
    }
    conversation.members = conversation.members.filter(member => member !== username);
    conversation.removedMembers.push({ username: username, date: new Date(date) });
    await conversation.save({ session });

    const message = new Message({
      conversationId: conversationId,
      author: "System/" + conversationId,
      text: `${username}-leaveConversation`,
      seenBy: [],
      date: new Date(date),
    })

    const newMessage = await message.save({ session });
    conversation.messages.push(newMessage._id);
    await conversation.save({ session });
    const conversationObj = conversation.toObject();

    delete conversationObj.messages;
    conversationObj.lastMessage = newMessage
    const usersTosend = [...conversation.members, username]
    const socketsIds = await getUsersSocketId(usersTosend);
    console.log("LAAAALALALALALALALALALALALALA")
    emitConvUpdateToUsers(getIo(), socketsIds, conversationObj);

    await session.commitTransaction();

    res.status(200).json({ message: "User left conversation" });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
});


//PATCH ADMIN - First admin set someone admin of a group conversation 

router.patch("/setAdmin", auth, async (req, res) => {
  const { conversationId, addedUsername, userId, username } = req.body;
  if (!conversationId || !username || !userId) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (req.user.userId !== userId) {
    return res.status(403).json({ message: "Access denied." });
  }
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    if (!conversation.isGroupConversation) {
      return res.status(400).json({ message: "This is not a group conversation" });
    }

    if (!conversation.admin.includes(username)) {
      return res.status(400).json({ message: "You are not an admin of this conversation" });
    }
    if (conversation.admin.includes(addedUsername)) {
      return res.status(400).json({ message: "User is already an admin" });
    }
    conversation.admin.push(addedUsername)

    await conversation.save();
    res.status(200).json(conversation.admin);

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
})


// PATCH ADMIN - Remove someone admin of a group conversation
router.patch("/removeAdmin", auth, async (req, res) => {
  const { conversationId, username, removerUserId, removedUsername } = req.body;
  console.log(req.body)
  console.log(conversationId, removedUsername, removerUserId, username)
  if (!conversationId || !removerUserId || !removedUsername || !username) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (req.user.userId !== removerUserId) {
    return res.status(403).json({ message: "Access denied." });
  }
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    if (!conversation.isGroupConversation) {
      return res.status(400).json({ message: "This is not a group conversation" });
    }

    if (conversation.admin[0] !== username) {
      return res.status(400).json({ message: "You dont have the permission to remove another admin " });
    }
    if (!conversation.admin.includes(removedUsername)) {
      return res.status(400).json({ message: "User is not an admin of this conversation" });
    }
    if (removedUsername === username) {
      return res.status(400).json({ message: "You cannot remove yourself as an admin" });
    }
    conversation.admin = conversation.admin.filter(admin => admin !== removedUsername)

    await conversation.save();
    res.status(200).json(conversation.admin);

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
})


// PATCH conversationPhoto - Change conversation photo
router.patch("/changeConversationPhoto", auth, async (req, res) => {
  const { conversationId, photoStr, userId, date } = req.body;
  if (!conversationId || !photoStr || !userId) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (req.user.userId !== userId) {
    return res.status(403).json({ message: "Access denied." });
  }

  const user = await User.findById(userId).select("userName");
  const session = await Conversation.startSession();
  try {
    session.startTransaction();


    const conversation = await Conversation.findById(conversationId).session(session);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    if (!conversation.isGroupConversation) {
      return res.status(400).json({ message: "This is not a group conversation" });
    }

    if (!conversation.admin.includes(user.userName)) {
      return res.status(400).json({ message: "You are not an admin of this conversation" });
    }

    conversation.customization.photo = photoStr;
    await conversation.save({ session });

    const message = new Message({
      conversationId: conversationId,
      author: "System/" + conversationId,
      text: `${user.userName}-changeConversationPhoto`,
      seenBy: [user.userName],
      date: new Date(date),
    })

    const newMessage = await message.save({ session });

    conversation.messages.push(newMessage._id);
    await conversation.save({ session });

    const conversationObj = conversation.toObject();
    delete conversationObj.messages;

    const usersTosend = [...conversation.members.filter(member => member !== user.userName)]  // remove the user who sent the request// !! Read commit message !
    const socketsIds = await getUsersSocketId(usersTosend);
    conversationObj.lastMessage = newMessage
    emitConvUpdateToUsers(getIo(), socketsIds, conversationObj);

    await session.commitTransaction();
    res.status(200).json({ conversation: conversationObj, message: newMessage });

  }

  catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
})

// PATCH conversationName - Change conversation name
router.patch("/changeConversationName", auth, async (req, res) => {
  const { conversationId, conversationName, userId, date } = req.body;
  if (!conversationId || !conversationName || !userId || !date) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (req.user.userId !== userId) {
    return res.status(403).json({ message: "Access denied." });
  }

  const user = await User.findById(userId).select("userName");
  const session = await Conversation.startSession();
  try {
    session.startTransaction();


    const conversation = await Conversation.findById(conversationId).session(session);
    if (!conversation) throw new Error("Conversation not found");
    if (!conversation.isGroupConversation) throw new Error("This is not a group conversation")
    if (!conversation.admin.includes(user.userName)) throw new Error("You are not an admin of this conversation")

    conversation.customization.conversationName = conversationName;
    await conversation.save({ session });

    const message = new Message({
      conversationId: conversationId,
      author: "System/" + conversationId,
      text: `${user.userName}-changeConversationName-${conversationName}`,
      seenBy: [user.userName],
      date: new Date(date),
    })

    const newMessage = await message.save({ session });

    conversation.messages.push(newMessage._id);
    await conversation.save({ session });

    const conversationObj = conversation.toObject();
    delete conversationObj.messages;

    const usersTosend = [...conversation.members.filter(member => member !== user.userName)]  // remove the user who sent the request// !! Read commit message !!
    const socketsIds = await getUsersSocketId(usersTosend);
    conversationObj.lastMessage = newMessage
    emitConvUpdateToUsers(getIo(), socketsIds, conversationObj);

    await session.commitTransaction();
    res.status(200).json({ conversation: conversationObj, message: newMessage });

  }

  catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
})

// PATCH conversation emoji - Change conversation emoji
router.patch("/changeEmoji", auth, async (req, res) => {
  const { conversationId, emoji, userId, date } = req.body;
  if (!conversationId || !emoji || !userId || !date) return res.status(400).json({ message: "All fields are required" });

  if (req.user.userId !== userId) return res.status(403).json({ message: "Access denied." });


  const user = await User.findById(userId).select("userName");
  if (!user) return res.status(404).json({ message: "User not found" });

  const session = await Conversation.startSession();
  try {
    session.startTransaction();

    const conversation = await Conversation.findById(conversationId).session(session);
    if (!conversation) throw new Error("Conversation not found");
    if (!conversation.admin.includes(user.userName)) throw new Error("You are not an admin of this conversation")

    conversation.customization.emoji = emoji;
    await conversation.save({ session });

    const message = new Message({
      conversationId: conversationId,
      author: "System/" + conversationId,
      text: `${user.userName}-changeEmoji-${emoji}`,
      seenBy: [user.userName],
      date: new Date(date),
    })

    const newMessage = await message.save({ session });

    conversation.messages.push(newMessage._id);
    await conversation.save({ session });

    const conversationObj = conversation.toObject();
    delete conversationObj.messages;

    const usersTosend = [...conversation.members.filter(member => member !== user.userName)]  // remove the user who sent the request// !! Read commit message !!
    const socketsIds = await getUsersSocketId(usersTosend);
    conversationObj.lastMessage = newMessage
    emitConvUpdateToUsers(getIo(), socketsIds, conversationObj);

    await session.commitTransaction();
    res.status(200).json({ conversation: conversationObj, message: newMessage });

  }

  catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
})



module.exports = router;
