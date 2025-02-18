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
const { setUserOnline, setUserOffline } = require("../Services/User");

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
        socket.on("userConnected", ({ socketId, userId }) => {
            socket.userId = userId
            console.log("USER CONNECTED");
            console.log(socket.userId)
            setUserOnline(getIo(), socketId, userId);
        })
        //emitUserOnlineStatus()
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

        socket.on("disconnect", async () => {
            console.log(socket.id + " disconnected");
            console.log(socket.userId)
            const user = await setUserOffline(socket.userId);
            console.log("CHAHAHAHAH")
            console.log(user)
            emitUserOnlineStatus(io, user);
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
