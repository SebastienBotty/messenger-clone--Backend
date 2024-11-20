const mongoose = require("mongoose");
const Schema = mongoose.Schema;


const ProfilePicSchema = new Schema({
    userId: {
        type: String,
        require: true
    },
    userName: {
        type: String,
        require: true
    },
    pathName: {
        type: String,
        require: true
    },
    lastModified: {
        type: Date,
        require: true
    },
    size: {
        type: Number,
        require: true
    },
})

module.exports = mongoose.model("ProfilePic", ProfilePicSchema);