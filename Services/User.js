const User = require("../Models/User");
const s3 = require("../Config/S3")


const bucketName = process.env.AWS_BUCKET_NAME;

const userStatusMap = new Map(); // { userId: { isOnline: boolean, status: string } }


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

const getUsersSocketIdById = async (idsArr) => {
    const usersSockets = await Promise.all(
        idsArr.map(async (id) => {
            const user = await User.findById(id, { socketId: 1, userName: 1 });
            //console.log(user)
            if (!user) {
                return null;
            }
            return { username: user.userName, userId: id, socketId: user.socketId };
        })
    );
    const filteredUsersSockets = usersSockets.filter((socket) => socket !== null);
    return filteredUsersSockets
}

//Set User online

const setUserOnline = async (socketId, userId) => {
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
        return user
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
        Expires: 60 * 60 * 24 * 7
    });
    return signedUrl
}

const getUserProfilePicUrlByPath = async (path) => {
    const signedUrl = s3.getSignedUrl("getObject", {
        Bucket: bucketName,
        Key: path,
        ResponseContentDisposition: "attachment", // Indique au navigateur de télécharger le fichier plutôt que de l'afficher
        Expires: 60 * 60 * 24 * 7
    });
    return signedUrl
}

const updateUserStatus = (userId, isOnline, status = undefined) => {
    const currentStatus = getUserStatus(userId);
    /*  console.log('"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
     console.log(currentStatus) */
    const updatedStatus = {
        ...currentStatus,
        isOnline,
        status: status === undefined ? currentStatus.status : status,
        lastSeen: status === "Offline" || isOnline === false ? currentStatus.lastSeen : new Date(),
    };
    /*     console.log(updatedStatus)
     */
    userStatusMap.set(userId, updatedStatus);
    /*  console.log(`Statut de l'utilisateur ${userId} mis à jour :`, updatedStatus);
     console.log(userStatusMap) */
    return updatedStatus
};

const getUserStatus = (userId) => {
    const user = userStatusMap.get(userId)
    /*  console.table(userStatusMap)
     console.log(userId) */
    if (!user) {
        //console.log('no user ofund')
        return {
            isOnline: false,
            status: "Offline",
            lastSeen: new Date()
        }
    }
    //console.log("user found")
    return user
};


module.exports = { getUsersSocketId, getUsersSocketIdById, setUserOnline, setUserOffline, getUserProfilePicUrl, getUserProfilePicUrlByPath, getUserStatus, updateUserStatus, userStatusMap }