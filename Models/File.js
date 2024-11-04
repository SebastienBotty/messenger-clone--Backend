const mongoose = require("mongoose");
const Schema = mongoose.Schema;



const FileSchema = new Schema({
    conversationId: String,
    pathName: String,
    lastModified: Date,
    type: String,
    size: Number,
});


module.exports = mongoose.model("File", FileSchema);
