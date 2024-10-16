const emitMsgToUsers = (
  io,
  socketIdArr,
  message,
  conversation,
  precedentMessage
) => {
  socketIdArr.map((socketId) => {
    io.to(socketId.socketId).emit("message", [
      message,
      conversation,
      precedentMessage,
    ]);
    console.log("Message envoyé à " + socketId.userName);
  });
};

const emitTypingToUsers = (
  io,
  socketIdArr,
  isWriting,
  writingUser,
  conversation
) => {
  socketIdArr.map((socketId) => {
    io.to(socketId.socketId).emit("typing", [
      isWriting,
      writingUser,
      conversation,
    ]);
    console.log("Message TYPING envoyé à " + socketId.userName);
  });
};

const emitSeenMsgToUsers = (io, socketIdArr, message, conversation) => {
  socketIdArr.map((socketId) => {
    io.to(socketId.socketId).emit("seenMessage", [message, conversation]);
    console.log("Message  VU envoyé à " + socketId.userName);
  });
};

module.exports = { emitMsgToUsers, emitTypingToUsers, emitSeenMsgToUsers };
