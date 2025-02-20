const User = require("../Models/User");
const s3 = require("../Config/S3")
const { emitUserOnlineStatus } = require("../Utils/SocketUtils")
const { getIo } = require('../Config/Socket');

const bucketName = process.env.AWS_BUCKET_NAME;
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

//Set User online

const setUserOnline = async (io, socketId, userId) => {
    try {
        const user = await User.findById(userId).select("-messages");
        if (!user) {
            res.status(404).json({ message: "User not found" });
        }
        user.socketId = socketId;
        user.isOnline = true;
        if (user.status !== "Offline") user.lastSeen = new Date();
        console.log("user online " + user.userName)
        await user.save();
        const emitData = { username: user.userName, isOnline: user.isOnline, userId: user._id, lastSeen: user.lastSeen, socketId: user.socketId };
        /* console.log("xxx")
        console.log(emitData) */
        emitUserOnlineStatus(io, emitData);
        return true
    } catch (error) {
        console.error(error.message)
        return false
    }
}
//Set user offline
const setUserOffline = async (userId) => {
    const user = await User.findById(userId).select("-messages");
    if (!user) {
        console.log("user non trouvé")
        return null;
    }

    user.isOnline = false;
    user.lastSeen = new Date();
    user.socketId = "";
    await user.save();
    console.log(user.userName + " offline")
    console.log(user.isOnline)
    return {
        isOnline: user.isOnline,
        username: user.userName,
        userId: user._id,
        lastSeen: user.lastSeen
    };
}

const getUserProfilePicUrl = async (userId) => {
    const photoPath = await User.findById(userId).select("photo")
    if (!photoPath.photo) return ""
    const signedUrl = s3.getSignedUrl("getObject", {
        Bucket: bucketName,
        Key: photoPath.photo,
        ResponseContentDisposition: "attachment", // Indique au navigateur de télécharger le fichier plutôt que de l'afficher
        Expires: 60 * 60 * 2
    });
    return signedUrl
}


module.exports = { getUsersSocketId, setUserOnline, setUserOffline, getUserProfilePicUrl }