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

//-------------------------GET--------------------------------------------------------------------
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

// Add a user to a conversation 

router.patch("/addUser", auth, async (req, res) => {
  const { conversationId, adderUsername, adderUserId, addedUsername, addedUserId } = req.body;

  if (!conversationId || !adderUsername || !adderUserId || !addedUsername || !addedUserId) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (req.user.userId !== adderUserId) {
    return res.status(403).send("Access denied.");
  }

  const session = await Conversation.startSession();

  try {
    session.startTransaction();

    const user = await User.findById(addedUserId).session(session);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.userName !== addedUsername) {
      throw new Error("Username/userId does not match");
    }

    if (!user.conversations.includes(conversationId)) {
      user.conversations.push(conversationId);
      await user.save({ session });
    }


    const conversation = await Conversation.findById(conversationId).session(session);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    if (!conversation.admin.includes(adderUsername)) {
      throw new Error("You are not the admin of this conversation");
    }
    if (conversation.members.includes(addedUsername)) {
      throw new Error("User already in the conversation");
    }
    if (!conversation.isGroupConversation) {
      throw new Error("You can't add a user to a private conversation");
    }

    conversation.members.push(addedUsername);
    await conversation.save({ session });

    await session.commitTransaction();

    res.status(200).json({ message: "User added to conversation" });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
});

// Remove a user from a conversation
router.patch("/removeUser", auth, async (req, res) => {
  const { conversationId, removerUsername, removerUserId, removedUsername } = req.body;

  if (!conversationId || !removerUsername || !removerUserId || !removedUsername) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (req.user.userId !== removerUserId) {
    return res.status(403).json({ message: "Access denied." });
  }

  const session = await Conversation.startSession();

  try {
    session.startTransaction();

    const user = await User.findOne({ userName: removedUsername }).session(session);
    if (!user) {
      throw new Error("User not found");
    }

    user.conversations = user.conversations.filter(convId => convId.toString() !== conversationId);
    await user.save({ session });


    const conversation = await Conversation.findById(conversationId).session(session);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    if (!conversation.admin.includes(removerUsername)) {
      throw new Error("You are not the admin of this conversation");
    }
    if (!conversation.members.includes(removedUsername)) {
      throw new Error("User is not in the conversation");
    }
    if (!conversation.isGroupConversation) {
      throw new Error("You can't remove a user from a private conversation");
    }

    conversation.members = conversation.members.filter(member => member !== removedUsername);
    await conversation.save({ session });

    await session.commitTransaction();
    console.log(conversation)
    res.status(200).json({ members: conversation.members });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
});

// Leave a conversation
router.patch("/leaveConversation", auth, async (req, res) => {
  const { conversationId, username, userId } = req.body;
  console.log(req.body)
  if (!conversationId || !username || !userId) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (req.user.userId !== userId) {
    return res.status(403).send("Access denied.");
  }

  const session = await Conversation.startSession();

  try {
    session.startTransaction();

    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.userName !== username) {
      throw new Error("Username/userId does not match");
    }
    user.conversations = user.conversations.filter(convId => convId.toString() !== conversationId);
    await user.save({ session });


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
    await conversation.save({ session });


    await session.commitTransaction();

    res.status(200).json({ message: "User left conversation" });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
});




module.exports = router;
