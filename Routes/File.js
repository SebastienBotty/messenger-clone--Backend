const express = require("express");
const router = express.Router();
const multer = require("multer");
require("dotenv").config();
const { auth } = require("../Middlewares/authentication");
const Conversation = require("../Models/Conversation");
const File = require("../Models/File");
const ProfilePic = require("../Models/ProfilePic");
const User = require("../Models/User");
const s3 = require('../Config/S3')
const { getUserProfilePicUrl } = require('../Services/User')
const APIUrl = process.env.API_URL
const { emitProfilPicUpdate } = require('../Utils/SocketUtils')
const { getIo } = require('../Config/Socket')
const { getOlderFiles, getNewerFiles, copyImageOnS3, createFolderInS3IfNotExists } = require('../Services/File')

const bucketName = process.env.AWS_BUCKET_NAME;

// Configure multer to use memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
});
//----------------------------------------------------------POST
// Route to upload files in a conversation
router.post(
  "/upload/:conversationId",
  auth,
  upload.array("files"),
  async (req, res) => {
    const convId = req.params.conversationId;
    const fileNamesArr = [];
    try {
      // Check if folder exists in S3, if not create it

      // Upload each file to S3
      await Promise.all(
        req.files.map(async (file) => {
          const timeStamp = Date.now();

          const type = file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/") ? "Medias" : "Files";
          const decodedFileName = decodeURIComponent(file.originalname);
          const params = {
            Bucket: bucketName,
            Key: `${convId}/${type}/${timeStamp}-${decodedFileName}`,
            Body: file.buffer,
            ContentType: file.mimetype,
          };

          await s3.upload(params).promise();

          //console.log(file.originalname)
          const newFile = new File({
            conversationId: convId,
            pathName: `${convId}/${type}/${timeStamp}-${decodedFileName}`,
            type: type,
            lastModified: timeStamp,
            size: file.size,
            fileName: `${timeStamp}-${decodedFileName}`
          });

          await newFile.save();

          fileNamesArr.push(`${type}/${timeStamp}-${decodedFileName}`);
        })
      );

      res.status(200).json({ fileNames: fileNamesArr });
      console.log('res')
    } catch (err) {
      f
      console.error("Error uploading files to S3:", err);
      res.status(500).send("Failed to upload files.");
    }
  }
);

//Post Profile picture
router.post('/profilePic/:userId', auth, upload.single('profilePic'), async (req, res) => {
  const userId = req.params.userId;
  const file = req.file;
  const timeStamp = Date.now();

  if (userId !== req.user.userId) return res.status(403).json({ message: "Access denied. You're not who you pretend to be." });
  if (file.size > 5 * 1024 * 1024) return res.status(400).json({ message: "Image size must be less than 5MB" });
  if (!userId || !file) return res.status(400).json({ message: "All fields are required" });

  const user = await User.findById(userId).select("userName");
  if (!user) return res.status(404).json({ message: "User not found" });

  const username = user.userName
  const decodedFileName = decodeURIComponent(file.originalname);

  console.log(username)

  const params = {
    Bucket: bucketName,
    Key: `/users/${userId}/profilePic/${timeStamp}-${decodedFileName}`,
    Body: file.buffer,
    ContentType: file.mimetype,
  };
  const session = await ProfilePic.startSession()
  try {
    await s3.upload(params).promise();
    session.startTransaction();
    const newProfilePic = new ProfilePic({
      userId: userId,
      username: username,
      pathName: `/users/${userId}/profilePic/${timeStamp}-${decodedFileName}`,
      lastModified: timeStamp,
      size: file.size,
    });

    await newProfilePic.save({ session });

    const user = await User.findOne({ _id: userId });
    if (!user) throw new Error(`User not found: ${userId}`);

    user.photo = `/users/${userId}/profilePic/${timeStamp}-${decodedFileName}`;
    await user.save({ session });
    await session.commitTransaction();

    const signedUrl = await getUserProfilePicUrl(userId)
    emitProfilPicUpdate(getIo(), userId, signedUrl)
    res.status(200).json({ image: signedUrl });
  } catch (err) {
    console.error("Error uploading files to S3:", err);
    session.abortTransaction();
    res.status(500).json({ message: err.message });
  } finally {
    session.endSession()
  }
});

//Transfer image from a conversation to another
router.post("/userId/:userId/transferImage", auth, async (req, res) => {
  const userId = req.params.userId;
  const sender = req.body.sender
  const targetConversationId = req.body.targetConversationId;
  const fileUrl = req.body.fileUrl;
  const date = req.body.date;

  const userApiToken = req.headers["authorization"]

  const filePath = fileUrl.split("?")[0].split('amazonaws.com/')[1];
  const conversationIdSource = filePath.split("/")[0]

  //console.log("Route appelée")


  if (userId !== req.user.userId) {
    return res
      .status(403)
      .send("Access denied. You're not who you pretend to be.");
  }
  const conversationSource = await Conversation.findById(conversationIdSource).select("members").populate("lastMessage");
  if (!conversationSource) {
    //console.log('Conversation non trouvée')
    return res.status(404).json({ message: "Conversation not found" });
  }
  if (!conversationSource.members.some(member => new RegExp("^" + sender + "$", "i").test(member.username))) {
    //console.log('Membre pas dans la convo cible')
    return res.status(403).json({ message: "You are not a member of the source conversation" });
  }

  const conversationTarget = await Conversation.findById(targetConversationId).select("members").populate("lastMessage");
  if (!conversationTarget) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  if (!conversationTarget.members.some(member => new RegExp("^" + sender + "$", "i").test(member.username))) {
    return res.status(403).json({ message: "You are not a member of the target conversation" });
  }

  await createFolderInS3IfNotExists(bucketName, targetConversationId);

  const copyImage = await copyImageOnS3(filePath, targetConversationId, date);
  //console.log(copyImage)

  if (!copyImage) {
    return res.status(500).json({ message: "Failed to copy image" });
  }
  const copyPath = copyImage.replace(":", "/");
  const params = {
    Bucket: bucketName,
    Key: copyPath,
  }

  const data = await s3.headObject(params).promise();
  //console.log("444444444444444444444444444")
  //console.log(data)

  const newFile = new File({
    conversationId: targetConversationId,
    pathName: copyPath,
    type: "Medias",
    lastModified: new Date(date).getTime(),
    size: data.ContentLength
  });

  await newFile.save();

  const newMessage = {
    author: sender,
    authorId: userId,
    text: "PATHIMAGE/" + copyImage,
    seenBy: [{ username: sender, userId: userId, seenDate: new Date() }],
    date: date,
    conversationId: targetConversationId,
  };


  // Gotta modify this ugly code, learnt a better way since then
  try {
    const response = await fetch(
      `${APIUrl}/message/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: userApiToken,
        },
        body: JSON.stringify(newMessage),
      }
    );
    if (!response.ok) {
      console.log("ERROR sending message");

      throw new Error("Failed to create message");
    }
    console.log("Image transfered successfully");
    const data = await response.json();
    //console.log(data);
    return res.status(200).json(data);
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ message: error.message });
  }
})

//----------------------------------------------------------GET
// Route pour récupérer des fichiers spécifiques par leurs noms
router.get(
  "/conversationId/:conversationId/getFiles",
  auth,
  async (req, res) => {
    const convId = req.params.conversationId;
    const fileNames = req.query.fileNames.split(",");

    //console.log(convId);
    //console.log(fileNames);

    if (!Array.isArray(fileNames) || fileNames.length === 0) {
      return res.status(400).json({
        error: "An array of file names is required in the query parameters.",
      });
    }

    try {
      const filesData = await Promise.all(
        fileNames.map(async (fileName) => {
          const filePath = `${convId}/${decodeURIComponent(fileName)}`
          const params = {
            Bucket: bucketName,
            Key: filePath,
          };
          try {



            const data = await s3.headObject(params).promise();
            const mimeType = data.ContentType;
            const signedUrl = s3.getSignedUrl("getObject", {
              Bucket: bucketName,
              Key: params.Key,
              ResponseContentDisposition: "attachment", // Indique au navigateur de télécharger le fichier plutôt que de l'afficher
              Expires: 60 * 60 * 24

            });

            const file = await File.findOne({ pathName: filePath })

            return {
              _id: file._id,
              fileName,
              type: mimeType.startsWith("image/") ? "image" : "file",
              url: signedUrl,
            };
          } catch (err) {
            console.error(`Error fetching file ${decodeURIComponent(fileName)} from S3:`, err);
            return null; // Return null for files that couldn't be fetched
          }
        })
      );

      const filteredFilesData = filesData.filter((file) => file !== null);

      if (filteredFilesData.length === 0) {
        return res
          .status(404)
          .json({ error: "No files found matching the given names." });
      }
      filteredFilesData.forEach((file) => {
        if (file.type === "file") {
          res.set({
            "Content-Disposition": `attachment; filename="${file.fileName}"`,
          });
        }
      });
      console.log("ICIICICICICICICICICICICICI")
      console.log(filteredFilesData)
      res.status(200).json({ files: [...filteredFilesData] });
    } catch (err) {
      console.error("Error fetching files from S3:", err);
      res.status(500).send("Failed to fetch files.");
    }
  }
);


//GET Recents  images of conversation with pagination of 18 images
// Deleted conversation => returns only files more recent than deleteDate
router.get('/userId/:userId/conversationId/:conversationId/getRecentFiles', async (req, res) => {
  const { start, fileType } = req.query;
  const { conversationId, userId } = req.params;
  const pageSize = 24
  if (!conversationId || !start || !userId) {
    return res.status(400).json({ message: "Missing required parameters" });
  }

  const user = await User.findById(userId).select("userName");
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const convMembers = await Conversation.findById(conversationId).populate("lastMessage");
  if (!convMembers) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  if (!convMembers.members.some(member => member.username === user.userName) && !convMembers.removedMembers.some((member) => member.username === user.userName)) {
    return res.status(403).json({ message: "You are not a member of this conversation" });
  }

  try {
    const userDelConvs = await User.findById(userId).select("deletedConversations");
    let deletedConv = userDelConvs.deletedConversations.find((conv) => conv.conversationId === conversationId)
    const removedMember = convMembers.removedMembers.find((member) => member.username === user.userName)

    const files = await File.find({
      conversationId,
      type: fileType,
      lastModified: {
        $gte: deletedConv?.deleteDate || 0, ...(removedMember ? { $lte: new Date(removedMember.date) } : {})
      }

    })
      .sort({ lastModified: -1 })
      .skip(start)
      .limit(pageSize);

    if (files.length === 0) {
      return res.status(200).json([]);
    }
    const filesWithUrls = await Promise.all(files.map(async (file) => {
      const signedUrl = s3.getSignedUrl("getObject", {
        Bucket: bucketName,
        Key: file.pathName,
        ResponseContentDisposition: "attachment",
        Expires: 60 * 60 * 24
      });
      return {
        _id: file._id,
        Key: file.pathName,
        Url: signedUrl,
        LastModified: file.lastModified,
        Size: file.size
      };
    }));
    return res.status(200).json(filesWithUrls)

  } catch (error) {
    return res.status(500).json({ message: error.message });
  }


})
router.get("/userId/:userId/conversationId/:conversationId/getMoreImages", auth, async (req, res) => {
  const userId = req.params.userId;
  const convId = req.params.conversationId;
  const fileId = decodeURIComponent(req.query.fileId)

  let isPreviousFiles;

  switch (req.query.prev) {
    case 'true':
      isPreviousFiles = true;
      break;
    case 'false':
      isPreviousFiles = false;
      break;
    default:
      return res.status(400).json({ message: "Prev parameter isn't a boolean" })
  }

  const rejectedFilesId = req.query.rejectedFilesIds.includes("-") ? req.query.rejectedFilesIds.split("-") : [req.query.rejectedFilesIds]
  let removedMemberDate = undefined
  let convDeleteDate = undefined


  if (userId !== req.user.userId) {
    return res
      .status(403)
      .json({ message: "Access denied. You're not who you pretend to be." });
  }

  if (!convId || !fileId) {
    return res.status(400).json({ message: "Missing required parameters" });
  }

  try {
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const conversation = await Conversation.findById(convId)
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    if (user.deletedConversations.some(conv => conv.conversationId === convId)) {
      convDeleteDate = user.deletedConversations.find(conv => conv.conversationId === convId).deleteDate
    }

    if (!conversation.members.some(member => member.username === user.userName) && !conversation.removedMembers.some(member => member.username === user.userName)) {
      return res
        .status(403)
        .json({ message: "Access denied. You're not a member of this conversation." });
    }

    if (conversation.removedMembers.some(member => member.username === user.userName)) {
      removedMemberDate = conversation.removedMembers.find(member => member.username === user.userName).date
    }


    const referenceFile = await File.findById(fileId)
    if (!referenceFile) throw new Erro("File not found")

    const files = isPreviousFiles ?
      await getOlderFiles(referenceFile._id, referenceFile.lastModified, convId, referenceFile.type, convDeleteDate, removedMemberDate, rejectedFilesId) :
      await getNewerFiles(referenceFile._id, referenceFile.lastModified, convId, referenceFile.type, convDeleteDate, removedMemberDate, rejectedFilesId)

    const imagesData = await Promise.all(
      files.map(async (img) => {
        try {
          const signedUrl = s3.getSignedUrl("getObject", {
            Bucket: bucketName,
            Key: img.pathName,
            Expires: 60 * 60 * 24,
          });

          return {
            _id: img._id,
            fileName: img.fileName || "unknown",
            src: signedUrl,
            lastModified: img.lastModified
          };
        } catch (error) {
          console.error("Error generating signed URL for image:", img.pathName, error);
          return null;
        }
      })
    );
    const filteredImagesData = imagesData.filter(data => data !== null);
    return res.status(200).json(filteredImagesData)
  }
  catch (error) {
    return res.status(400).json({ message: error.message })
  }

});


//GET all conversation images older and newer than a givven file
// Gotta improe this route now that i modified a few things but it works and im lazy
router.get("/userId/:userId/conversationId/:conversationId/getConversationImagesAround", auth, async (req, res) => {

  const userId = req.params.userId
  const convId = req.params.conversationId;
  const fileId = req.query.fileId

  let removedMemberDate = undefined
  let convDeleteDate = undefined

  //console.log(convId, fileName)
  if (userId !== req.user.userId) {
    return res
      .status(403)
      .json({ message: "Access denied. You're not who you pretend to be." });
  }

  if (!convId || !fileId) {
    return res.status(400).json({ message: "Missing required parameters" });
  }

  try {
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.deletedConversations.some(conv => conv.conversationId === convId)) {
      convDeleteDate = user.deletedConversations.find(conv => conv.conversationId === convId).deleteDate
    }

    const conversation = await Conversation.findById(convId).populate("lastMessage");
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (!conversation.members.some(member => member.username === user.userName) && !conversation.removedMembers.some(member => member.username === user.userName)) {
      return res
        .status(403)
        .json({ message: "Access denied. You're not in this conversation." });
    }

    if (conversation.removedMembers.some(member => member.username === user.userName)) {
      removedMemberDate = conversation.removedMembers.find(member => member.username === user.userName).date
    }
    const referenceFile = await File.findById(fileId)
    if (!referenceFile) throw new Erro("File not found")


    const [imagesBefore, imagesAfter] = await Promise.all([
      getOlderFiles(referenceFile._id, referenceFile.lastModified, convId, referenceFile.type, convDeleteDate, removedMemberDate),
      getNewerFiles(referenceFile._id, referenceFile.lastModified, convId, referenceFile.type, convDeleteDate, removedMemberDate)
    ])

    const images = [...imagesBefore, referenceFile, ...imagesAfter]

    const imagesData = await Promise.all(
      images.sort((a, b) => new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime())
        .map(async (img) => {
          try {
            const signedUrl = s3.getSignedUrl("getObject", {
              Bucket: bucketName,
              Key: img.pathName,
              Expires: 60 * 60 * 24,
            });

            return {
              _id: img._id,
              fileName: img.fileName || "unknown",
              src: signedUrl,
              lastModified: img.lastModified
            };
          } catch (error) {
            console.error("Error generating signed URL for image:", img.fileName, error);
            return null;
          }
        })
    );

    // Filtrer les résultats pour enlever les nulls en cas d'erreur
    const filteredImagesData = imagesData.filter(data => data !== null);

    return res.status(200).json(filteredImagesData)

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
})





/* not used anymore but wanna keep if i want to use it
const allowedExtensions = ["jpg", "jpeg", "png", "gif", "webp", "svg"];

router.get("/listMediafiles", async (req, res) => {

  const { conversationId, continuationToken, pageSize = 1 } = req.query;
  const params = {
    Bucket: bucketName,
    Prefix: conversationId + '/',
    MaxKeys: pageSize,
  };

  if (continuationToken) {
    params.ContinuationToken = continuationToken;
  }

  try {
    const data = await s3.listObjectsV2(params).promise()
    const mediaFiles = data.Contents.filter(item => {
      const extension = item.Key.split('.').pop().toLowerCase();
      return allowedExtensions.includes(extension);
    });
    console.log(data.Contents)
    console.log('----------------------------------------------------------------------------------------')
    console.log(mediaFiles)


    // Générer un lien signé pour chaque fichier
    const mediaFilesWithUrls = await Promise.all(mediaFiles.map(async (file) => {
      const signedUrl = s3.getSignedUrl('getObject', {
        Bucket: bucketName,
        Key: file.Key,
        Expires: 60 * 60,  // Lien valable pour 1 heure
      });

      return {
        Key: file.Key,
        LastModified: file.LastModified,
        Size: file.Size,
        Url: signedUrl,
      };
    }));
    res.status(200).json({
      mediaFiles: mediaFilesWithUrls,
      continuationToken: data.NextContinuationToken || null,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des fichiers:", error);
    res.status(400).json({ message: error.message });
  }
});
 */

module.exports = router;
