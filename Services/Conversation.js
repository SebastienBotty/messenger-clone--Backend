const Conversation = require("../Models/Conversation");


const getConvUsers = async (convId) => {
    const conv = await Conversation.findById(convId).select("members");
    return conv.members.map(member => member.username);
};


module.exports = { getConvUsers }