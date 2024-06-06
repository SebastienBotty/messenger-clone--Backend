const emitMsgToUsers = (io, socketIdArr, message, conversationId) => {
  socketIdArr.map((socketId) => {
    io.to(socketId.socketId).emit("message", [message, conversationId]);
    console.log("Message envoyé à " + socketId.userName);
  });
};

module.exports = { emitMsgToUsers };
