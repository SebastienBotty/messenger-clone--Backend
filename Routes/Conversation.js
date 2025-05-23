const express = require("express");
const router = express.Router();
const Conversation = require("../Models/Conversation");
const Message = require("../Models/Message");
const User = require("../Models/User");
const { auth, authAdmin } = require("../Middlewares/authentication");
const checkPostConvBody = require("../Middlewares/Conversation");

const { getIo } = require('../Config/Socket') // Importer le serveur Socket.IO initialisé
const { emitConvUpdateToUsers, emitAddMembersToUsers, emitRemoveMemberToUsers, emitChangeConvCustomizationToUsers, emitChangeConvAdminToUsers } = require('../Utils/SocketUtils');
const { getUsersSocketId, getUserProfilePicUrlByPath, getUserStatus, getUserProfilePicUrl } = require('../Services/User');



//----------------------POST---------------------------
router.post("/", auth, checkPostConvBody, async (req, res) => {
  const members = req.body.members;
  const creationDate = req.body.creationDate;
  const admin = req.body.admin;
  const user = await User.findOne({ userName: admin }).select("_id");
  if (!user) {
    return res.status(400).json({ message: "User not found" });
  }
  if (String(user._id) !== req.user.userId) {
    return res
      .status(403)
      .json({ message: "You can't create a conversation for someone else" });
  }

  const isGroupConversation = members.length > 2; //If there is more than 2 members when conversatoin is created, it is flagged as a group Conversation. Then the admin is the one who created the conversation
  //const admin = isGroupConversation ? req.body.admin : []; //If there is only 2, there's noe admin

  try {
    const membersData = []
    for (let member of members) {
      const user = await User.findOne({
        userName: new RegExp("^" + member + "$", "i"),
      });
      if (!user) {
        return res.status(404).json({ message: "User" + member + " not found" });
      }
      const memberData = {
        userId: user._id,
        username: user.userName,
        nickname: "",
        photo: user.photo ? await getUserProfilePicUrlByPath(user.photo) : "",
        status: user.status,
        isOnline: user.isOnline
      }
/*       //console.log(memberData);
 */      membersData.push(memberData)
    }

    const conversation = new Conversation({
      isGroupConversation: isGroupConversation,
      members: membersData,
      admin: isGroupConversation ? [admin] : membersData.map(member => member.username),
      messages: [],
      creationDate: creationDate,
      removedMembers: [],
    });
    //console.log('1')

    const newConversation = await conversation.save();
    //console.log('"2')
    for (let member of members) {
      const user = await User.findOne({
        userName: new RegExp("^" + member + "$", "i"),
      });
      if (user) {
        user.conversations.push(newConversation._id);
        //console.log(user.userName + " trouver")
        await user.save();
      } else {
        //console.log(user + " pas trouvé")
        return res.status(404).json({ message: "User member not found" });
      }
    }
    //console.log('"3')
    res.status(201).json(newConversation);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

//-------------------------GET--------------------------------------------------------------------
//Get all conversations
router.get("/", authAdmin, async (req, res) => {
  try {
    const conversation = await Conversation.find().populate("lastMessage");
    res.json(conversation);
  } catch (error) {
    res.status(400).json({ mesage: error.message });
  }
});

// Get any conversation based on its ID (admin)

router.get("/:conversationId", authAdmin, async (req, res) => {
  const conversationId = req.params.conversationId;
  try {
    const conversation = await Conversation.findById(conversationId).populate("lastMessage").select('-messages');
    res.json(conversation);
  } catch (error) {
    res.status(400).json({ mesage: error.message });
  }
});

//GET user's conversations 
router.get("/userId/:userId/getConversations", auth, async (req, res) => {
  const userId = req.params.userId
  if (req.user.userId !== userId) {
    return res.status(403).send("Access denied, you're not who you pretend to be");
  }
  let convIdsArr = []
  let conversationsArr = []
  try {
    const user = await User.findById(userId).select("conversations")
    if (!user) return res.status(404).json({ message: "User not found" })
    convIdsArr = user.conversations

    for (const convId of convIdsArr) {
      const conversation = await Conversation.findById(convId).select('-messages').populate("lastMessage")
      if (!conversation) continue
      conversationsArr.push(conversation.toObject())
    }

    const convWithPicsUpdates = await Promise.all(
      conversationsArr.map(async (conv) => {
        // Mise à jour des membres actifs
        const memberPicsUpdates = await Promise.all(
          conv.members
            .map(async (member) => {
              const profilePicUrl = await getUserProfilePicUrl(member.userId);
              const status = getUserStatus(member.userId)
              return { ...member, photo: profilePicUrl, ...status };
            })
        );

        // Mise à jour des membres supprimés
        const removedMembersPicsUpdates = await Promise.all(
          (conv.removedMembers || []).map(async (member) => {
            const user = await User.findOne({ userName: member.username }).select('_id photo');
            const profilePicUrl = user?.photo ? await getUserProfilePicUrlByPath(user.photo) : '';
            return { ...member, photo: profilePicUrl };
          })
        );

        return {
          ...conv,
          members: memberPicsUpdates,
          removedMembers: removedMembersPicsUpdates
        };
      })
    );


    return res.status(200).json(convWithPicsUpdates)
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

// GET conversation last msg
router.get(
  "/userId/:userId/conversation/lastMessage?",
  auth,
  async (req, res) => {
    const userId = req.params.userId;
    const conversationId = req.query.conversationId;

    if (req.user.userId !== userId) {
      return res.status(403).send("Access denied.");
    }
    try {
      const username = await User.findById(userId).select("userName");
      if (!username) {
        return res.status(404).json({ message: "User not found" });
      }
      const conversation = await Conversation.findById(conversationId).populate("lastMessage")

      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (!conversation.members.some(member => member.username === username.userName) && !conversation.removedMembers.some(member => member.username === username.userName)) {
        return res
          .status(403)
          .json({ message: "Access denied. You're not in this conversation." });
      }
      if (conversation.removedMembers.some(member => member.username === username.userName)) {
        ////console.log("2")
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
      const lastUndeletedMessage = await Message.findOne({
        conversationId: conversationId,
        deletedBy: {
          $not: {
            $elemMatch: { userId: userId }
          }
        }
      }).sort({ date: -1 });
      if (lastUndeletedMessage) {

        res.status(200).json(lastUndeletedMessage);
      } else {
        const lastMessage = await Message.findOne({
          conversationId: conversationId,
        }).sort({ date: -1 });

        res.status(200).json(lastMessage);
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
  ////console.log(userId, username, recipientUsername);

  if (userId !== req.user.userId) {
    return res
      .status(403)
      .send("Access denied. You're not who you pretend to be.");
  }
  try {
    const user = await User.findOne({
      userName: new RegExp("^" + username, "i"),
    });
    if (!user) {
      //console.log("USER NOT FOUND POUR IS PRIVATE CONV")
      return res.status(404).json({ message: "User" + username + " not found" });
    }
    const conversationsId = user.conversations;
    for (const conversationId of conversationsId) {
      const conversation = await Conversation.findById(conversationId).populate("lastMessage");
      if (!conversation.isGroupConversation) {
        if (
          conversation.members.some(member => member.username === username) &&
          conversation.members.some(member => member.username === recipientUsername)
        ) {
          //console.log("CONVEERSATOIN EXISTANTE")
          const conversationObj = conversation.toObject();

          // Mise à jour des membres actifs
          const memberPicsUpdates = await Promise.all(
            conversationObj.members
              .map(async (member) => {
                const profilePicUrl = await getUserProfilePicUrl(member.userId);
                const status = getUserStatus(member.userId)
                return { ...member, photo: profilePicUrl, ...status };
              })
          );

          // Mise à jour des membres supprimés
          const removedMembersPicsUpdates = await Promise.all(
            (conversationObj.removedMembers || []).map(async (member) => {
              const user = await User.findOne({ userName: member.username }).select('_id photo');
              const profilePicUrl = user?.photo ? await getUserProfilePicUrlByPath(user.photo) : '';
              return { ...member, photo: profilePicUrl };
            })
          );

          conversationObj.members = memberPicsUpdates;
          conversationObj.removedMembers = removedMembersPicsUpdates;

          return res.json(conversationObj);
        }
      }
    }
    //console.log("PAS DE CONVEERSATOIN EXISTANTE")
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
  //console.log(userId, members, user)
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
    let conversations = await Conversation.find({
      members: { $all: [...regexMembers, regexUser] },
    }).select("-messages").populate("lastMessage")

    if (conversations.length === 0) {
      ////console.log("RIEN TROUVE")
      conversations = await Conversation.find({
        "customization.conversationName": { $in: regexMembers },
        members: { $in: regexUser },
      }).select("-messages").populate("lastMessage");
    }


    let conversationsArr = []
    if (conversations) {
      for (let conversation of conversations) {
        try {
          const messagesId = await Conversation.findById(conversation._id).select(
            "messages"
          ).populate("lastMessage");

          if (messagesId.messages.length > 0) {
            lastMsgId = messagesId.messages[messagesId.messages.length - 1];

            const lastMessage = await Message.findById(lastMsgId);
            conversationsArr.push({ ...conversation.toObject(), lastMessage: lastMessage, photo: "" })
            ////console.log(test)
          }

        }
        catch (error) {
          res.status(400).json({ message: error.message });
        }
        ////console.log(conversation)
      }
    }

    res.status(200).json(conversationsArr);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
})


//-------------------------PATCH

//PATCH CONV MEMBERS -  Add a user to a grup onversation 

router.patch("/addMembers", auth, async (req, res) => {
  const { conversationId, adderUsername, adderUserId, addedUsers, date } = req.body;
  ////console.log(req.body)

  if (!conversationId || !adderUsername || !adderUserId || !addedUsers || !addedUsers.length || !date) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (req.user.userId !== adderUserId) {
    return res.status(401).json({ message: "Access denied." });
  }

  const session = await Conversation.startSession();

  try {
    session.startTransaction();
    const conversation = await Conversation.findById(conversationId).populate("lastMessage").session(session);
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
      seenBy: [{ username: adderUsername, userId: adderUserId, seenDate: new Date() }],
      date: new Date(date),
    })
    const newMessage = await message.save({ session });
    let addedUsersArr = []
    for (const addedUser of addedUsers) {
      const addedUsername = addedUser.userName;
      const addedUserId = addedUser._id;
      const addedUserPhoto = addedUser.photo;


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
      if (conversation.members.some(member => member.username === addedUsername)) {
        throw new Error(`User already in the conversation: ${addedUsername}`);
      }

      if (conversation.removedMembers.some(member => member.username === addedUsername)) {
        ////console.log("here")
        ////console.log(conversation.removedMembers)
        conversation.removedMembers = conversation.removedMembers.filter(member => member.username !== addedUsername)
      }
      const userObj = {
        userId: addedUserId,
        username: addedUsername,
        nickname: "",
        status: addedUser.status,
        isOnline: addedUser.isOnline,
        lastSeen: addedUser.lastSeen,
        isTyping: false,
        photo: addedUserPhoto
      }
      //console.log("XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX")
      //console.log(addedUserPhoto)
      conversation.members.push(userObj)
      addedUsersArr.push(userObj)
    }
    conversation.messages.push(newMessage._id);
    conversation.lastMessage = newMessage._id
    await conversation.save({ session });
    const conversationObj = conversation.toObject();
    delete conversationObj.messages;
    const usersTosend = conversation.members.filter(member => member.username !== adderUsername).map(member => member.username) // remove the user who sent the request// !! Read commit message !
    const socketsIds = await getUsersSocketId(usersTosend);
    conversationObj.lastMessage = newMessage

    emitAddMembersToUsers(getIo(), socketsIds, conversationObj, addedUsersArr);

    await session.commitTransaction();
    res.status(200).json({ conversation: conversationObj, addedUsersArr });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
});


//PATCH CONV MEMBERS -  Remove a user from a group conversation
router.patch("/removeUser", auth, async (req, res) => {
  const { conversationId, removerUsername, removerUserId, targetUsername, targetUserId, targetPhoto, date } = req.body;
  console.log({ conversationId, removerUsername, removerUserId, targetUsername, targetUserId, date })
  if (!conversationId || !removerUsername || !removerUserId || !targetUsername || !targetUserId || targetPhoto === undefined || targetPhoto === null || !date) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (req.user.userId !== removerUserId) {
    return res.status(403).json({ message: "Access denied." });

  }

  const session = await Conversation.startSession();

  try {
    session.startTransaction();


    const conversation = await Conversation.findById(conversationId).populate("lastMessage").session(session);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    if (!conversation.admin.includes(removerUsername)) {
      throw new Error("You are not the admin of this conversation");
    }
    if (conversation.admin.includes(targetUsername)) {
      throw new Error("You can't remove an admin of the conversation");
    }
    if (!conversation.members.some(member => member.username === targetUsername)) {
      throw new Error("User is not in the conversation");
    }
    if (!conversation.isGroupConversation) {
      throw new Error("You can't remove a user from a private conversation");
    }

    conversation.members = conversation.members.filter(member => member.username !== targetUsername);
    conversation.removedMembers.push({ username: targetUsername, date: new Date(date), userId: targetUserId });
    await conversation.save({ session });


    const message = new Message({
      conversationId: conversationId,
      author: "System/" + conversationId,
      text: `${removerUsername}-removeUser-${targetUsername}`,
      seenBy: [{ username: removerUsername, userId: removerUserId, seenDate: new Date() }],
      date: new Date(date),
    })

    const newMessage = await message.save({ session });
    conversation.messages.push(newMessage._id);
    conversation.lastMessage = newMessage._id
    await conversation.save({ session });
    const conversationObj = conversation.toObject();
    delete conversationObj.messages;

    const usersTosend = [...conversation.members.filter(member => member.username !== removerUsername).map(member => member.username), targetUsername] // remove the user who sent the request// !! Read commit message !
    const socketsIds = await getUsersSocketId(usersTosend);
    conversationObj.lastMessage = newMessage
    emitRemoveMemberToUsers(getIo(), socketsIds, conversationObj, targetUsername, targetUserId, targetPhoto);
    await session.commitTransaction();
    res.status(200).json({ conversation: conversationObj, targetUsername, targetUserId, targetPhoto });

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
  ////console.log(req.body)
  if (!conversationId || !username || !userId || !date) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (req.user.userId !== userId) {
    return res.status(403).send("Access denied.");
  }

  const session = await Conversation.startSession();
  let isAdmin = false;
  try {
    session.startTransaction();

    const conversation = await Conversation.findById(conversationId).populate("lastMessage").session(session);
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
      isAdmin = true;
    }
    if (!conversation.members.some(member => member.username === username)) {
      throw new Error("User is not in the conversation");
    }
    conversation.members = conversation.members.filter(member => member.username !== username);
    conversation.removedMembers.push({ username: username, date: new Date(date), userId: userId });
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
    conversation.lastMessage = newMessage._id
    await conversation.save({ session });
    const conversationObj = conversation.toObject();

    delete conversationObj.messages;
    conversationObj.lastMessage = newMessage
    const usersTosend = [...conversation.members.map(member => member.username), username]
    const socketsIds = await getUsersSocketId(usersTosend);
    ////console.log("LAAAALALALALALALALALALALALALA")
    emitRemoveMemberToUsers(getIo(), socketsIds, conversationObj, username);
    if (isAdmin) {
      emitChangeConvAdminToUsers(getIo(), socketsIds, conversationObj, username, false);
    }

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

router.patch("/changeAdmin", auth, async (req, res) => {
  const { conversationId, targetUsername, userId, username, changeAdmin } = req.body;
  if (!conversationId || !username || !userId) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (req.user.userId !== userId) {
    return res.status(403).json({ message: "Access denied." });
  }
  try {
    const conversation = await Conversation.findById(conversationId).populate("lastMessage").select("-messages");
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    if (!conversation.isGroupConversation) {
      return res.status(400).json({ message: "This is not a group conversation" });
    }

    if (!conversation.admin.includes(username)) {
      return res.status(400).json({ message: "You are not an admin of this conversation" });
    }

    if (changeAdmin) {
      if (conversation.admin.includes(targetUsername)) {
        return res.status(400).json({ message: "User is already an admin" });
      }
      conversation.admin.push(targetUsername)
    } else {
      conversation.admin = conversation.admin.filter(admin => admin !== targetUsername)
    }
    await conversation.save();


    const usersTosend = conversation.members.filter(member => member.username !== username).map(member => member.username) // remove the user who sent the request// !! Read commit message !
    const socketsIds = await getUsersSocketId(usersTosend);

    emitChangeConvAdminToUsers(getIo(), socketsIds, conversation, targetUsername, changeAdmin);
    res.status(200).json({ conversation: conversation, targetUsername: targetUsername, changeAdmin: changeAdmin });

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
})


// PATCH ADMIN - Remove someone admin of a group conversation
router.patch("/removeAdmin", auth, async (req, res) => {
  const { conversationId, username, removerUserId, removedUsername } = req.body;
  ////console.log(req.body)
  ////console.log(conversationId, removedUsername, removerUserId, username)
  if (!conversationId || !removerUserId || !removedUsername || !username) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (req.user.userId !== removerUserId) {
    return res.status(403).json({ message: "Access denied." });
  }
  try {
    const conversation = await Conversation.findById(conversationId).populate("lastMessage");
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


    const conversation = await Conversation.findById(conversationId).populate("lastMessage").session(session);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    if (!conversation.isGroupConversation) {
      return res.status(400).json({ message: "This is not a group conversation" });
    }



    conversation.customization.photo = photoStr;
    await conversation.save({ session });

    const message = new Message({
      conversationId: conversationId,
      author: "System/" + conversationId,
      text: `${user.userName}-changeConversationPhoto`,
      seenBy: [{ username: user.userName, userId: user._id, seenDate: new Date() }],
      date: new Date(date),
    })

    const newMessage = await message.save({ session });

    conversation.messages.push(newMessage._id);
    conversation.lastMessage = newMessage._id

    await conversation.save({ session });

    const conversationObj = conversation.toObject();
    delete conversationObj.messages;

    const usersTosend = conversation.members.filter(member => member.username !== user.userName).map(member => member.username) // remove the user who sent the request// !! Read commit message !
    //console.log(usersTosend)
    const socketsIds = await getUsersSocketId(usersTosend);
    conversationObj.lastMessage = newMessage
    emitChangeConvCustomizationToUsers(getIo(), socketsIds, conversationObj, "photo", photoStr);

    await session.commitTransaction();
    res.status(200).json({ conversation: conversationObj, customizationKey: "photo", customizationValue: photoStr });

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
  if (!conversationId || !userId || !date) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (req.user.userId !== userId) {
    return res.status(403).json({ message: "Access denied." });
  }

  const user = await User.findById(userId).select("userName");
  const session = await Conversation.startSession();
  try {
    session.startTransaction();


    const conversation = await Conversation.findById(conversationId).populate("lastMessage").session(session);
    if (!conversation) throw new Error("Conversation not found");
    if (!conversation.isGroupConversation) throw new Error("This is not a group conversation")

    conversation.customization.conversationName = conversationName;
    await conversation.save({ session });

    const message = new Message({
      conversationId: conversationId,
      author: "System/" + conversationId,
      text: `${user.userName}-changeConversationName-${conversationName}`,
      seenBy: [{ username: user.userName, userId: user._id, seenDate: new Date() }],
      date: new Date(date),
    })

    const newMessage = await message.save({ session });

    conversation.messages.push(newMessage._id);
    conversation.lastMessage = newMessage._id

    await conversation.save({ session });

    const conversationObj = conversation.toObject();
    delete conversationObj.messages;

    const usersTosend = conversation.members.filter(member => member.username !== user.userName).map(member => member.username) // remove the user who sent the request// !! Read commit message !!
    //console.log(usersTosend)
    const socketsIds = await getUsersSocketId(usersTosend);
    conversationObj.lastMessage = newMessage
    emitChangeConvCustomizationToUsers(getIo(), socketsIds, conversationObj, "conversationName", conversationName);

    await session.commitTransaction();
    res.status(200).json({ conversation: conversationObj, customizationKey: "conversationName", customizationValue: conversationName });

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

    const conversation = await Conversation.findById(conversationId).populate("lastMessage").session(session);
    if (!conversation) throw new Error("Conversation not found");
    if (!conversation.members.some(member => member.username === user.userName)) throw new Error("Access denied. You're not in this conversation.");


    conversation.customization.emoji = emoji;
    await conversation.save({ session });

    const message = new Message({
      conversationId: conversationId,
      author: "System/" + conversationId,
      text: `${user.userName}-changeEmoji-${emoji}`,
      seenBy: [{ username: user.userName, userId: user._id, seenDate: new Date() }],
      date: new Date(date),
    })

    const newMessage = await message.save({ session });

    conversation.messages.push(newMessage._id);
    conversation.lastMessage = newMessage._id

    await conversation.save({ session });

    const conversationObj = conversation.toObject();
    delete conversationObj.messages;

    const usersTosend = conversation.members.filter(member => member.username !== user.userName).map(member => member.username) // remove the user who sent the request// !! Read commit message !
    const socketsIds = await getUsersSocketId(usersTosend);
    conversationObj.lastMessage = newMessage
    emitChangeConvCustomizationToUsers(getIo(), socketsIds, conversationObj, "emoji", emoji);

    await session.commitTransaction();
    res.status(200).json({ conversation: conversationObj, customizationKey: "emoji", customizationValue: emoji });

  }

  catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
})

router.patch("/changeNickname", auth, async (req, res) => {
  const { conversationId, userId, userTargetId, nickname } = req.body;
  if (!conversationId || !userId || !userTargetId || !nickname) return res.status(400).json({ message: "All fields are required" });

  if (req.user.userId !== userId) return res.status(403).json({ message: "Access denied." });
  const session = await Conversation.startSession();
  try {
    session.startTransaction();

    const conversation = await Conversation.findById(conversationId).populate("lastMessage");
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });
    if (!conversation.members.some(member => member.userId === userTargetId)) return res.status(400).json({ message: "UserTarget is not a member of this conversation" });
    if (!conversation.members.some(member => member.userId === userId)) return res.status(400).json({ message: "User is not a member of this conversation" });

    const user = conversation.members.find(member => member.userId === userId);
    const userTargetUsername = conversation.members.find(member => member.userId === userTargetId).username;
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!userTargetUsername) return res.status(404).json({ message: "UserTarget not found" });

    const message = new Message({
      conversationId: conversationId,
      author: "System/" + conversationId,
      text: `${user.username}-changeNickname-${userTargetUsername}-${nickname}`,
      seenBy: [{ username: user.username, userId: user.userId, seenDate: new Date() }],
      date: new Date(),
    })

    const newMessage = await message.save({ session });

    conversation.messages.push(newMessage._id);
    await conversation.save({ session });

    conversation.members.find(member => member.userId === userTargetId).nickname = nickname;
    conversation.lastMessage = newMessage._id



    const conversationObj = conversation.toObject();
    delete conversationObj.messages;
    const usersTosend = conversation.members.filter(member => member.username !== user.username).map(member => member.username) // remove the user who sent the request// !! Read commit message !
    const socketsIds = await getUsersSocketId(usersTosend);
    conversationObj.lastMessage = newMessage
    emitConvUpdateToUsers(getIo(), socketsIds, conversationObj, "changeNickname", userTargetId, nickname);
    await session.commitTransaction();
    //console.log(conversationObj)
    res.status(200).json({ conversation: conversationObj });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }

})

router.patch("/changeTheme", auth, async (req, res) => {
  const { conversationId, theme, userId, date } = req.body;
  if (!conversationId || !theme || !userId || !date) return res.status(400).json({ message: "All fields are required" });

  if (req.user.userId !== userId) return res.status(403).json({ message: "Access denied." });


  const user = await User.findById(userId).select("userName");
  if (!user) return res.status(404).json({ message: "User not found" });

  const session = await Conversation.startSession();
  try {
    session.startTransaction();

    const conversation = await Conversation.findById(conversationId).populate("lastMessage").session(session);
    if (!conversation) throw new Error("Conversation not found");

    if (!conversation.members.some(member => member.username === user.userName)) {
      throw new Error("Access denied. You're not in this conversation.");
    }

    if (conversation.customization.theme === theme) {
      throw new Error("Conversation already has this theme")
    }

    conversation.customization.theme = theme;
    await conversation.save({ session });

    const message = new Message({
      conversationId: conversationId,
      author: "System/" + conversationId,
      text: `${user.userName}-changeTheme-${theme}`,
      seenBy: [{ username: user.userName, userId: user._id, seenDate: new Date() }],
      date: new Date(date),
    })

    const newMessage = await message.save({ session });

    conversation.messages.push(newMessage._id);
    conversation.lastMessage = newMessage._id

    await conversation.save({ session });

    const conversationObj = conversation.toObject();
    delete conversationObj.messages;

    const usersTosend = conversation.members.filter(member => member.username !== user.userName).map(member => member.username) // remove the user who sent the request// !! Read commit message !
    const socketsIds = await getUsersSocketId(usersTosend);
    conversationObj.lastMessage = newMessage
    emitChangeConvCustomizationToUsers(getIo(), socketsIds, conversationObj, "theme", theme);

    await session.commitTransaction();
    res.status(200).json({ conversation: conversationObj, customizationKey: "theme", customizationValue: theme });

  }

  catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
})




module.exports = router;
