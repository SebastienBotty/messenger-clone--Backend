const express = require("express");
const rateLimite = require("express-rate-limit");
const router = express.Router();
const User = require("../Models/User");
const Conversation = require("../Models/Conversation");
const Message = require("../Models/Message");
const jwt = require("jsonwebtoken");
const { auth, authAdmin } = require("../Middlewares/authentication");
const { getIo } = require('../Config/Socket');
const { getUserProfilePicUrl, updateUserStatus } = require("../Services/User");
const { notifyUserStatusChange } = require("../Services/Conversation");
require("dotenv").config();

//-------------------------POST
router.post("/", async (req, res) => {
  const { mail, userName } = req.body;
  const user = new User({
    mail: mail,
    userName: userName,
    conversations: [],
    mutedConversations: [],
    deletedConversations: [],
    socketId: "",
    photo: "",
    lastSeen: new Date(),
  });
  try {
    const newUser = await user.save();
    res.status(201).json(newUser);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
//-------------------------GET
// Get all users
router.get("/", authAdmin, async (req, res) => {
  try {
    const user = await User.find();
    res.status(200).json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get all user's info based on username query except conversations field
router.get("/username?", auth, async (req, res) => {
  try {
    const searchQuery = req.query.search;
    //console.log(req.query.exceptions)

    if (req.query.exceptions) {
      const exceptions = JSON.parse(decodeURIComponent(req.query.exceptions));

      //console.log(exceptions)
      const users = await User.find({
        userName: {
          $regex: `.*${searchQuery}.*`,
          $options: "i",
          $nin: exceptions
        }
      }).select("-conversations");
      let usersWithImg = []
      for (const user of users) {
        const userObj = user.toObject()
        userObj.photo = await getUserProfilePicUrl(user._id);
        usersWithImg.push(userObj)
      }
      //console.log("exceptions")
      return res.status(200).json(usersWithImg);
    }


    const users = await User.find({
      userName: { $regex: `.*${searchQuery}.*`, $options: "i" },
    }).select("-conversations");
    //console.log('non exceptions')
    let usersWithImg = []
    for (const user of users) {
      const userObj = user.toObject()
      userObj.photo = await getUserProfilePicUrl(user._id);
      usersWithImg.push(userObj)
    }
    //console.log("exceptions")
    return res.status(200).json(usersWithImg);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});


const loginLimiter = rateLimite.rateLimit({
  windowMs: 1000, // 1 sec
  max: 1, // 1 tentative max
  message: 'Trop de tentatives, réessayez plus tard.',
});

//GET All user's info base on his email    -----------------------------------> TODO: modify this to a correct login with firebase
router.get("/mail/:mail", loginLimiter, async (req, res) => {
  const mail = req.params.mail;

  try {
    const user = await User.findOne({ mail: { $regex: new RegExp(`^${mail}$`, "i") } });
    const token = jwt.sign(String(user._id), process.env.JWT_SECRET);
    const userObj = user.toObject()
    userObj.photo = await getUserProfilePicUrl(user._id);
    //console.log(userObj)
    res.status(200).json([userObj, { apiToken: token }]);

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
//GET User to  Verify if the user exists
router.get("/checkUserName/:userName", async (req, res) => {
  const userName = req.params.userName;
  try {
    const user = await User.findOne({
      userName: new RegExp("^" + userName + "$", "i"),
    });
    if (user) {
      res.json({ userExists: true });
    } else {
      res.json({ userExists: false });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
// GET Mail to verify if mail exists
router.get("/checkMail/:mail", async (req, res) => {
  const mail = req.params.mail;
  try {
    const user = await User.findOne({
      mail: new RegExp("^" + mail + "$", "i"),
    });
    if (user) {
      res.json({ mailExists: true });
    } else {
      res.json({ mailExists: false });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get user's conversations based on his user ID
router.get("/userConversationsId/userId/:userId", auth, async (req, res) => {
  const userId = req.params.userId;

  if (req.user.userId !== userId) {
    return res.status(403).send("Access denied.");
  }
  try {
    const userConvs = await User.find({ _id: userId }, "conversations deletedConversations");
    /*   console.log("icicicicicicicicics")
      console.log(userConvs) */
    const convObj = userConvs[0].toObject();
    /*   console.log("-----------------------------------------------------------------------------------------------------")
      console.log(convObj.conversations) */
    for (deletedConv of convObj.deletedConversations) {
      const lastMsgConv = await Message.findOne({ conversationId: deletedConv.conversationId, date: { $gt: new Date(deletedConv.deleteDate) } })
      /*  console.log(lastMsgConv) */
      /*  console.log(deletedConv.deleteDate) */
      if (!lastMsgConv) {
        /*  console.log("TRUC DE CONV")
         console.log(convObj.conversations) */
        //console.log("Pas de mg plus récent donc je retire de Conv")
        /*   console.log(deletedConv.conversationId)
          console.log(convObj.conversations) */
        convObj.conversations = convObj.conversations.filter((convId) => convId !== deletedConv.conversationId)
        /* console.log("xxxxxxxxx")
        console.log(convObj.conversations) */
      } else {
        // console.log("Msg plus récent donc je laisse")
      }
    }
    delete convObj.deletedConversations
    /*  console.log(convObj) */
    res.status(200).json([convObj]);
  } catch (error) {
    res.status(400).json({ mesage: error.message });
  }
});

/*// Get user's conversations based on his user ID
router.get("/userConversationsId/userId/:userId", auth, async (req, res) => {
  const userId = req.params.userId;

  if (req.user.userId !== userId) {
    return res.status(403).send("Access denied.");
  }
  try {
    const user = await User.find({ _id: userId }, "conversations");
    console.log("---------------------------------------------------------------------------------------------")
    console.log(user)
    res.status(200).json(user);
  } catch (error) {
    res.status(400).json({ mesage: error.message });
  }
});*/


//Get user SocketId
router.get("/getSockets?", auth, async (req, res) => {
  const usersNameArr = req.query.convMembers.split("-");
  const usersSockets = await Promise.all(
    usersNameArr.map(async (userName) => {
      const user = await User.findOne(
        { userName: { $regex: `.*${userName}.*`, $options: "i" } },
        { socketId: 1 }
      );
      if (!user) {
        return null;
      }
      return { userName: userName, userId: user._id, socketId: user.socketId };
    })
  );
  const filteredUsersSockets = usersSockets.filter((socket) => socket !== null);
  console.log(filteredUsersSockets);
  res.status(200).json(filteredUsersSockets);
});

//get 5 latest conversation of a user
router.get("/userId/:userId/getLatestConversations?", auth, async (req, res) => {
  const userId = req.params.userId;
  if (req.user.userId !== userId) {
    return res.status(403).send("Access denied.");
  }
  try {
    const conversations = await Conversation.find({
      members: { $in: [userId] },
    }).select("-messages").populate("lastMessage");
    res.status(200).json(conversations);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});




//-------------------------PATCH
//PATCH socketId, isOnline, lastSeen
router.patch("/userId/:userId/socketId", auth, async (req, res) => {
  const userId = req.params.userId;
  const socketId = req.body.socketId;
  if (req.user.userId !== userId) {
    return res.status(403).json({ message: "Access denied." });
  }
  try {
    const user = await User.findOne({ _id: userId });
    if (!user) {
      res.status(404).json({ message: "User not found" });
    }
    user.socketId = socketId;
    user.isOnline = true;
    if (user.status !== "Offline") user.lastSeen = new Date();
    //console.log(user)
    await user.save();
    const emitData = { username: user.userName, isOnline: user.isOnline, userId: user._id, lastSeen: user.lastSeen, socketId: user.socketId };
    updateUserStatus(userId, user.isOnline, user.status);
    notifyUserStatusChange(getIo(), userId, user.isOnline, user.status);

    res.status(200).json(user.socketId);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});


//PATCH user status & lastSeen
router.patch("/:userId/changeStatus", auth, async (req, res) => {
  const userId = req.params.userId;
  const status = req.body.status;
  if (req.user.userId !== userId) {
    return res.status(403).json({ message: "Access denied." });
  }

  try {
    const user = await User.findByIdAndUpdate(userId);
    let lastSeen = new Date();
    if (!user) return res.status(404).json({ message: "User not found" });
    if (status === "Offline") user.lastSeen = lastSeen;

    user.status = status;
    await user.save();
    const emitData = { username: user.userName, userId: user._id, status: user.status, lastSeen: lastSeen, socketId: user.socketId };
    updateUserStatus(user._id, user.isOnline, user.status);
    notifyUserStatusChange(getIo(), user._id, user.isOnline, user.status, lastSeen);

    res.status(200).json({ status: user.status, lastSeen: lastSeen });

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
})


//PATCH user mutedConversations - Add a conversation to the mutedConversations array
router.patch("/userId/:userId/muteConversation", auth, async (req, res) => {
  const userId = req.params.userId;
  const conversationId = req.body.conversationId;
  const untilDate = req.body.untilDate;

  if (req.user.userId !== userId) {
    return res.status(403).json({ message: "Access denied." });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const conversation = user.mutedConversations.find(
      conv => conv.conversationId === conversationId
    );
    if (conversation) {
      conversation.untilDate = untilDate;
    } else {
      user.mutedConversations.push({ conversationId, untilDate });
    }

    await user.save();
    res.status(200).json({ message: "Conversation muted" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});


//PATCH user mutedConversations - Remove a conversation from the mutedConversations array
router.patch("/userId/:userId/unmuteConversation", auth, async (req, res) => {
  const userId = req.params.userId;
  const conversationId = req.body.conversationId;
  if (req.user.userId !== userId) {
    return res.status(403).json({ message: "Access denied." });
  }
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.mutedConversations = user.mutedConversations.filter(
      (muted) => muted.conversationId !== conversationId
    );
    await user.save();
    res.status(200).json({ message: "Conversation unmuted" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
})

//PATCH DELETE CONVERSATION => add conversation to deletedConversations array
router.patch("/userId/:userId/deleteConversation", auth, async (req, res) => {
  const userId = req.params.userId;
  const conversationId = req.body.conversationId;
  const deleteDate = new Date(req.body.deleteDate)
  if (req.user.userId !== userId) {
    return res.status(403).json({ message: "Access denied." });
  }
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    let deletedConv = user.deletedConversations.find((conv) => conv.conversationId === conversationId)
    if (deletedConv) {
      deletedConv.deleteDate = deleteDate;
    } else {
      user.deletedConversations.push({ conversationId, deleteDate });
    }
    await user.save()
    res.status(200).json({ message: "Conversation deleted" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
})


module.exports = router;
