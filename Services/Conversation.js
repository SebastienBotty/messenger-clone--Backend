const Conversation = require("../Models/Conversation");
const { emitStatusChangeToUsers } = require("../Utils/SocketUtils");
const { getUsersSocketIdById } = require("../Services/User");

const getConvUsers = async (convId) => {
    const conv = await Conversation.findById(convId).select("members");
    return conv.members.map(member => member.username);
};

const notifyUserStatusChange = async (io, userId, isOnline, status, lastSeen) => {
    try {
        const conversations = await Conversation.find({ "members.userId": userId });

        if (!conversations) return false;

        const uniqueUserIds = new Set();

        conversations.forEach((conversation) => {
            conversation.members.forEach((member) => {
                if (member.userId !== userId) {
                    uniqueUserIds.add(member.userId);
                }
            });
        });

        const userIdsToNotify = Array.from(uniqueUserIds);
        const socketsIds = await getUsersSocketIdById(userIdsToNotify);


        emitStatusChangeToUsers(io, socketsIds, {
            userId,
            isOnline,
            status,
            lastSeen
        });

        console.log(`Statut de l'utilisateur ${userId} notifié à ${socketsIds.length} utilisateurs.`);
        //console.log(userId, isOnline, status);
    } catch (error) {
        console.error("Erreur lors de la notification du changement de statut :", error);
    }
};

module.exports = { getConvUsers, notifyUserStatusChange }