const { Server } = require("socket.io");
const {
    emitMsgToUsers,
    emitTypingToUsers,
    emitSeenMsgToUsers,
    emitConvUpdateToUsers,
    emitAdminChangeToUsers,
} = require("./Utils/SocketUtils");

let io
//------------------Web Socket
const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "http://localhost:3001",
        },
    });

    io.on("connection", (socket) => {
        console.log(socket.id + " connected");

        socket.on("typing", (data) => {
            // console.log(data);
            emitTypingToUsers(io, ...data);
        });
        socket.on("message", (data) => {

            emitMsgToUsers(io, ...data);
        });

        socket.on("seenMessage", (data) => {
            emitSeenMsgToUsers(io, ...data);
        });

        socket.on('convUpdate', (data) => {
            emitConvUpdateToUsers(io, ...data)
        })

        socket.on("adminChange", (data) => {
            emitAdminChangeToUsers(io, ...data)
        })

        socket.on("disconnect", (socket) => {
            console.log(socket + " disconnected");
        });
    });

}



const getIo = () => {
    if (!io) {
        throw new Error("Socket.io not initialized");
    }
    return io;
};

module.exports = { initSocket, getIo };
