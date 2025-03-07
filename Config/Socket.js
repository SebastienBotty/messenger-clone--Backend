const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const {
    emitMsgToUsers,
    emitTypingToUsers,
    emitSeenMsgToUsers,
    emitConvUpdateToUsers,
    emitAdminChangeToUsers,
    emitUserOnlineStatus
} = require("../Utils/SocketUtils");
const { setUserOnline, setUserOffline, updateUserStatus } = require("../Services/User");
const { notifyUserStatusChange } = require("../Services/Conversation");

let io
//------------------Web Socket
const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "http://localhost:3001",
        },
    });

    /* io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication error'));
        }

        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) {
                return next(new Error('Authentication error'));
            }
            socket.data.user = decoded; // Stocker les infos utilisateur dans `socket.data`
            next();
        });
    }); */

    io.on("connection", (socket) => {
        console.log(socket.id + " connected");
        socket.on("userConnected", async ({ socketId, userId }) => {
            socket.userId = userId
            console.log("USER CONNECTED");
            console.log(socket.userId)
            setUserOnline(socketId, userId);
            const updatedUser = await updateUserStatus(userId, true);
            notifyUserStatusChange(io, userId, true, null, updatedUser.lastSeen);

        })
        //emitUserOnlineStatus()
        socket.on("typing", (data) => {
            // console.log(data);
            emitTypingToUsers(io, ...data);
        });
        socket.on("message", (data) => {
            /* console.log("message")
            console.log(data) */
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

        socket.on("disconnect", async () => {
            console.log(socket.id + " disconnected");
            const setOfflineInDb = await setUserOffline(socket.userId);
            console.log("XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX")
            console.log(setOfflineInDb)
            console.log("XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX")

            const updatedStatus = await updateUserStatus(socket.userId, false);
            notifyUserStatusChange(io, socket.userId, false, null, updatedStatus.lastSeen);

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
