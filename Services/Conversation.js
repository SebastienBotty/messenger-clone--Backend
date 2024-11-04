const Conversation = require("../Models/Conversation");


const getConvUsers = async (convId) => {
    const conv = await Conversation.findById(convId).select("members");
    return conv.members;
};


module.exports = { getConvUsers }