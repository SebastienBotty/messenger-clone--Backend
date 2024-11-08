const User = require("../Models/User");

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

//Set user offline
const setUserOffline = async (socketId) => {
    const user = await User.findOne({ socketId: socketId }).select("-messages");
    if (!user) {
        console.log("user non trouvé")
        return null;
    }
    user.isOnline = false;
    user.lastSeen = new Date();
    user.socketId = "";
    await user.save();
    console.log(user)
    return {
        isOnline: user.isOnline,
        username: user.userName,
        userId: user._id,
        lastSeen: user.lastSeen
    };
}


module.exports = { getUsersSocketId, setUserOffline }