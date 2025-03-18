
const File = require("../Models/File")
//-------------------------------------------------------------- Functions
const maxFiles = 15;

const getOlderFiles = async (referenceId, referenceDate, convId, fileType, convDeleteDate = new Date(0), removedMemberDate = new Date(8640000000000000), rejectedFilesId = []) => {
    console.log("getOlderFiles called")
    console.log(rejectedFilesId)
    try {
        const olderFiles = await File.find({
            _id: { $nin: [referenceId, ...rejectedFilesId] },

            conversationId: convId,
            type: fileType,
            lastModified: {
                $gte: new Date(convDeleteDate),
                $lte: new Date(removedMemberDate),
                $lte: new Date(referenceDate)
            }

        })
            .sort({ lastModified: -1 })
            .limit(maxFiles);

        return olderFiles
    } catch (error) {
        console.error(error.message)
        return []
    }

}
const getNewerFiles = async (referenceId, referenceDate, convId, fileType, convDeleteDate = new Date(0), removedMemberDate = new Date(8640000000000000), rejectedFilesId = []) => {
    console.log("NewerFiles called")
    console.log(rejectedFilesId)
    try {
        const newerFiles = await File.find({
            _id: { $nin: [referenceId, ...rejectedFilesId] },

            conversationId: convId,
            type: fileType,
            lastModified: {
                $gte: new Date(convDeleteDate),
                $gte: new Date(referenceDate),
                $lte: new Date(removedMemberDate),
            }

        })
            .sort({ lastModified: 1 })
            .limit(maxFiles);
        console.log("//////////////////////////////////////////////////////////////////////")
        console.log(newerFiles)
        return newerFiles
    } catch (error) {
        console.error(error.message)
        return []
    }

}



function isImage(fileName) {
    const imageExtensions = [
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif',
        '.svg', '.webp', '.heif', '.heic', '.ico', '.psd',
        '.ai', '.eps', '.raw', '.cr2', '.nef', '.orf', '.sr2'
    ];
    return imageExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
}
function isVideo(fileName) {
    const videoExtensions = [
        '.mp4', '.mkv', '.mov', '.avi', '.wmv', '.flv', '.webm',
        '.mpeg', '.mpg', '.3gp', '.m4v', '.f4v', '.hevc'
    ];
    return videoExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
}

const copyImageOnS3 = async (imgFilePath, conversationIdTarget, date) => {
    const fileNameWithTimeStamp = imgFilePath.split("/")[2]
    const fileNameWithoutTimeStamp = decodeURIComponent(fileNameWithTimeStamp.substring(fileNameWithTimeStamp.indexOf('-') + 1))




    const newTimeStamp = new Date(date).getTime();
    //console.log('999999999999999999999999999999999')
    //console.log(imgFilePath)
    //console.log(fileNameWithTimeStamp)
    //console.log(fileNameWithoutTimeStamp)
    //console.log(`/${bucketName}/${imgFilePath}`)
    const params = {
        Bucket: bucketName,
        CopySource: `/${bucketName}/${imgFilePath}`, // Chemin d'origine
        Key: `${conversationIdTarget}/Medias/${newTimeStamp}-${fileNameWithoutTimeStamp}`, // Chemin cible
    };

    try {
        const test = await s3.copyObject(params).promise();
        //(test)
        //console.log("Image copied successfully");
        console.log("YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY")
        console.log(`${conversationIdTarget}:Medias/${newTimeStamp}-${fileNameWithoutTimeStamp}`)
        return `${conversationIdTarget}:Medias/${newTimeStamp}-${fileNameWithoutTimeStamp}`
    } catch (error) {
        console.error("Error copying image on S3:", error.message);
        return false
    }
};

// Function to create a folder in S3 if it doesn't already exist
// Not Rly useful, learned it creates the folder by itself is it doesn't exist but it works so i let it
async function createFolderInS3IfNotExists(bucketName, folderName) {
    //console.log(bucketName, folderName);
    try {
        const paramsMedias = {
            Bucket: bucketName,
            Key: `${folderName}/Medias/`, // Note: Using a slash to simulate a folder
            Body: "",
        };
        const paramsFiles = {
            Bucket: bucketName,
            Key: `${folderName}/Files/`, // Note: Using a slash to simulate a folder
            Body: "",
        };

        await s3.upload(paramsMedias).promise();
        await s3.upload(paramsFiles).promise();

    } catch (err) {
        if (err.code !== "EntityAlreadyExists") {
            throw err;
        }
    }
}

module.exports = {
    getOlderFiles, getNewerFiles, isImage, isVideo, copyImageOnS3, createFolderInS3IfNotExists
}