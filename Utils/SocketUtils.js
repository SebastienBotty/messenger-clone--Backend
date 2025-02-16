
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



const emitNewFileToUsers = (io, socketIdArr, data, conversation) => {
  socketIdArr.map((socketId) => {
    if (socketId.socketId) {
      io.to(socketId.socketId).emit("newFile", [data, conversation]);
      console.log("Message NEW FILE envoyé à " + socketId.userName);
    }
  });
}

const emitStatusChangeToUsers = (io, userData) => {
  if (!userData?.socketId) return

  io.except(userData.socketId).emit('changeStatus', { status: userData.status, lastSeen: userData.lastSeen, userId: userData.userId, username: userData.username });
}

const emitUserOnlineStatus = (io, userData) => {
  if (!userData?.socketId) return
  io.except(userData.socketId).emit('isUserOnline', { isOnline: userData.isOnline, lastSeen: userData.lastSeen, userId: userData.userId, username: userData.username });
}

const emitDeletedMsgToUsers = (io, socketIdArr, message, conversationId) => {
  socketIdArr.map((socketId) => {
    if (socketId.socketId) {
      io.to(socketId.socketId).emit("deletedMessage", [message, conversationId])
    }
  });

}
const emitChangeReactionToUsers = (io, socketIdArr, reactionsArr, messageId, conversationId) => {
  socketIdArr.map((socketId) => {
    if (socketId.socketId) {
      io.to(socketId.socketId).emit("changeReaction", [reactionsArr, messageId, conversationId])
    }
  });
}

const emitDeleteReactionToUsers = (io, socketIdArr, reactionsArr, messageId, conversationId) => {
  socketIdArr.map((socketId) => {
    if (socketId.socketId) {
      io.to(socketId.socketId).emit("deleteReaction", [reactionsArr, messageId, conversationId])
    }
  });
}

const emitEditedMsgToUsers = (io, socketIdArr, message) => {
  socketIdArr.map((socketId) => {
    if (socketId.socketId) {
      io.to(socketId.socketId).emit("editedMessage", message)
      console.log('emit msg to : ' + socketId.socketId)
    }
  });
}


module.exports = {
  emitChangeReactionToUsers, emitDeleteReactionToUsers,
  emitMsgToUsers, emitTypingToUsers, emitSeenMsgToUsers, emitConvUpdateToUsers,
  emitAdminChangeToUsers, emitNewFileToUsers, emitStatusChangeToUsers, emitUserOnlineStatus,
  emitDeletedMsgToUsers, emitEditedMsgToUsers
};
