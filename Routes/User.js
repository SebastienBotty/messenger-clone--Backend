const express = require("express");
const router = express.Router();
const User = require("../Models/User");

router.post("/", async (req, res) => {
  const { name, socketId, photo, conversation } = req.body;
  const user = new User({
    name: name,
    socketId: socketId,
    photo: photo,
    conversation: conversation,
  });
  try {
    const newUser = await user.save();
    res.status(201).json(newUser);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const user = await User.find();
    res.status(200).json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
