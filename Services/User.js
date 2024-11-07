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

const setUserOffline = async (socketId) => {
    const user = await User.findOne({ socketId: socketId });
    if (!user) {
        console.log("user non trouvé")
        return null;
    }
    user.isOnline = false;
    user.lastSeen = new Date();
    user.socketId = "";
    console.log(user)
    await user.save();
    return user.userName;
}


module.exports = { getUsersSocketId, setUserOffline }