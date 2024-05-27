const express = require("express");
const router = express.Router();
const User = require("../Models/User");
//-------------------------POST
router.post("/", async (req, res) => {
  const { mail, userName } = req.body;
  const user = new User({
    mail: mail,
    userName: userName,
    conversation: [],
  });
  try {
    const newUser = await user.save();
    res.status(201).json(newUser);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
//-------------------------GET
router.get("/", async (req, res) => {
  try {
    const user = await User.find();
    res.status(200).json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
// Verify if the user exists
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
// Verify if mail exists
router.get("/checkMail/:mail", async (req, res) => {
  const mail = req.params.mail;
  try {
    const user = await User.findOne({
      mail: new RegExp("^" + mail + "$", "i"),
    });
    console.log(user);
    if (user) {
      res.json({ mailExists: true });
    } else {
      res.json({ mailExists: false });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
//-------------------------PATCH
router.patch("/socketId/:socketId");

module.exports = router;
