const express = require("express");
const router = express.Router();
const User = require("../Models/User");
const Conversation = require("../Models/Conversation");
const jwt = require("jsonwebtoken");
const { auth, authAdmin } = require("../Middlewares/authentication");
require("dotenv").config();

//-------------------------POST
router.post("/", async (req, res) => {
  const { mail, userName } = req.body;
  const user = new User({
    mail: mail,
    userName: userName,
    conversations: [],
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
    console.log(req.query.exceptions)

    if (req.query.exceptions) {
      const exceptions = JSON.parse(decodeURIComponent(req.query.exceptions));

      console.log(exceptions)
      const users = await User.find({
        userName: {
          $regex: `.*${searchQuery}.*`,
          $options: "i",
          $nin: exceptions
        }
      }).select("-conversations");

      console.log("exceptions")
      return res.json(users);
    }


    const users = await User.find({
      userName: { $regex: `.*${searchQuery}.*`, $options: "i" },
    }).select("-conversations");
    console.log('non exceptions')
    res.json(users);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

//GET All user's info base on his email
router.get("/mail/:mail", async (req, res) => {
  const mail = req.params.mail;

  try {
    const user = await User.findOne({ mail: mail });
    const token = jwt.sign(String(user._id), process.env.JWT_SECRET);
    res.status(200).json([user, { ApiToken: token }]);
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
    const user = await User.find({ _id: userId }, "conversations");
    res.status(200).json(user);
  } catch (error) {
    res.status(400).json({ mesage: error.message });
  }
});


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
      return { userName: userName, socketId: user.socketId };
    })
  );
  const filteredUsersSockets = usersSockets.filter((socket) => socket !== null);
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
    }).select("-messages");
    res.status(200).json(conversations);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});




//-------------------------PATCH
router.patch("/userId/:userId/socketId", auth, async (req, res) => {
  const userId = req.params.userId;
  const socketId = req.body.socketId;
  if (req.user.userId !== userId) {
    return res.status(403).send("Access denied.");
  }
  try {
    const user = await User.findOne({ _id: userId });
    if (!user) {
      res.status(404).json({ message: "User not found" });
    }
    user.socketId = socketId;
    await user.save();
    res.status(200).json(user.socketId);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
