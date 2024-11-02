const mongoose = require("mongoose");
const Schema = mongoose.Schema;



const FileSchema = new Schema({
    conversationId: String,
    pathName: String,
    lastModified: Date,
    type: String,  // 'image' ou 'video'
});


module.exports = mongoose.model("File", FileSchema);
