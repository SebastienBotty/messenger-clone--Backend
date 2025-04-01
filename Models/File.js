const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const { getUsersSocketId } = require("../Services/User");
const { getConvUsers } = require("../Services/Conversation");
const { emitNewFileToUsers } = require("../Utils/SocketUtils");
const { getIo } = require('../Config/Socket')
const s3 = require('../Config/S3')
const bucketName = process.env.AWS_BUCKET_NAME;

const FileSchema = new Schema({
    conversationId: String,
    pathName: String,
    lastModified: Date,
    type: String,
    size: Number,
    fileName: String
});


// Middleware post-save : défini dans le fichier du modèle
FileSchema.post("save", async function (doc) {
    console.log("File saved: " + doc.pathName);
    const convUsers = await getConvUsers(doc.conversationId);
    const socketIds = await getUsersSocketId(convUsers)

    const signedUrl = s3.getSignedUrl("getObject", {
        Bucket: bucketName,
        Key: doc.pathName,
        ResponseContentDisposition: "attachment", // Indique au navigateur de télécharger le fichier plutôt que de l'afficher
        Expires: 60 * 60 * 24

    });
    const data = {
        Key: doc.pathName,
        LastModified: doc.lastModified,
        Size: doc.size,
        Url: signedUrl
    }

    emitNewFileToUsers(getIo(), socketIds, data, doc.conversationId)

});


module.exports = mongoose.model("File", FileSchema);
