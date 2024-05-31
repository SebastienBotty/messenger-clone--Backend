const express = require("express");
const router = express.Router();
const User = require("../Models/User");
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
router.get("/", async (req, res) => {
  try {
    const user = await User.find();
    res.status(200).json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get all user's info based on username query except conversations field
router.get("/username?", async (req, res) => {
  try {
    const searchQuery = req.query.search;
    const users = await User.find({
      userName: { $regex: `.*${searchQuery}.*`, $options: "i" },
    }).select("-conversations");

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

//GET All user's info base on his email
router.get("/mail/:mail", async (req, res) => {
  const mail = req.params.mail;
  try {
    const user = await User.findOne({ mail: mail });
    res.status(200).json(user);
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
router.get("/userConversationsId/userId/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const user = await User.find({ _id: userId }, "conversations");
    res.status(200).json(user);
  } catch (error) {
    res.status(400).json({ mesage: error.message });
  }
});
//-------------------------PATCH
router.patch("/userId/:userId/socketId", async (req, res) => {
  const userId = req.params.userId;
  const socketId = req.body.socketId;
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
