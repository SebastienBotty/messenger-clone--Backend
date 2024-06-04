const checkPostMsgBody = async (req, res, next) => {
  const { author, authorId, text, date, conversationId } = req.body;

  if (!author || !authorId || !text || !date || !conversationId) {
    return res
      .status(400)
      .json({ message: "All fields are required to post a message" });
  }
  next();
};

const checkGetMsgBody = async (req, res, next) => {
  const conversationId = req.query.conversationId;
  const start = req.query.start;
  const limit = req.query.limit;

  if (!conversationId) {
    return res
      .status(400)
      .json({ message: "conversationId is required to get messages" });
  }

  if (!start) {
    return res
      .status(400)
      .json({ message: "start is required to get messages" });
  }
  if (start < 0) {
    return res
      .status(400)
      .json({ message: "start must be greater than or equal to 0" });
  }

  if (!limit) {
    return res
      .status(400)
      .json({ message: "limit is required to get messages" });
  }

  if (limit < 0) {
    return res
      .status(400)
      .json({ message: "limit must be greater than or equal to 0" });
  }
  next();
};

module.exports = { checkPostMsgBody, checkGetMsgBody };
