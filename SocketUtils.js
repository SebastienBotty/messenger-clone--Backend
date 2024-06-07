const emitMsgToUsers = (io, socketIdArr, message, conversation) => {
  socketIdArr.map((socketId) => {
    io.to(socketId.socketId).emit("message", [message, conversation]);
    console.log("Message envoyé à " + socketId.userName);
  });
};

module.exports = { emitMsgToUsers };
