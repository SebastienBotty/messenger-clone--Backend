
const User = require("../Models/User");


const emitMsgToUsers = (
  io,
  socketIdArr,
  message,
  conversation,
  precedentMessage
) => {
  socketIdArr.map((socketId) => {
    //console.log(message, conversation)

    io.to(socketId.socketId).emit("message", [
      message,
      conversation,
      precedentMessage,
    ]);
    //console.log("Message envoyé à " + socketId.userName);
  });
};

const emitTypingToUsers = (
  io,
  socketIdArr,
  isWriting,
  writingUser,
  conversation
) => {
  if (!socketIdArr) return
  socketIdArr.map((socketId) => {
    if (socketId.socketId) {
      io.to(socketId.socketId).emit("typing", [
        isWriting,
        writingUser,
        conversation,
      ]);
    }

    // console.log("Message TYPING envoyé à " + socketId.userName);
  });
};

const emitSeenMsgToUsers = (io, socketIdArr, message, conversation) => {
  socketIdArr.map((socketId) => {
    if (socketId.socketId) {
      io.to(socketId.socketId).emit("seenMessage", [message, conversation])
    }
    //console.log("Message  VU envoyé à " + socketId.userName);
  });
};

const emitConvUpdateToUsers = (io, socketIdArr, conversation) => {
  //console.log(socketIdArr)
  socketIdArr.map((socketId) => {
    if (socketId.socketId) {
      io.to(socketId.socketId).emit("convUpdate", conversation);
      console.log("CONVERSATION UPDATE envoyé à " + socketId.userName);
    }

  });
}

const emitAdminChangeToUsers = (io, socketIdArr, adminArrAndConvId,) => {
  socketIdArr.map((socketId) => {
    if (socketId.socketId) {
      io.to(socketId.socketId).emit("adminChange", { adminArr: adminArrAndConvId[0], conversationId: adminArrAndConvId[1] });
      console.log("Message ADMIN UPDATE envoyé à " + socketId.userName);
    }
  });
}



const getUsersSocketId = async (usersNameArr) => {
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
  return filteredUsersSockets
}

module.exports = { emitMsgToUsers, emitTypingToUsers, emitSeenMsgToUsers, emitConvUpdateToUsers, emitAdminChangeToUsers, getUsersSocketId };
