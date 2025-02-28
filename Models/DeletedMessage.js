const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const deleteMessageSchema = Schema({
    messageId: {
        type: String,
        require: true,
        unique: true
    },
    author: {
        //Username of message sender
        type: String,
        require: true,
    },
    text: [{
        //Message content
        type: String,
        require: true,
    }],
    seenBy: [{
        username: {
            type: String,
            require: true
        },
        userId: {
            type: String,
            require: true
        },
        seenDate: {
            type: Date,
            require: true
        }
    }],
    deletedBy: [{
        username: String,
        userId: String
    }],
    deletedForEveryone: {
        type: Boolean,
        default: false
    },
    date: {
        //Date when message has been sent
        type: Date,
        require: true,
    },
    conversationId: String,
    deleteDate: {
        type: Date,
        require: true,
    },
    reactions: [{
        username: String,
        reaction: String,
        userId: String
    }]
});

module.exports = mongoose.model("DeletedMessages", deleteMessageSchema);
