const checkPostConvBody = async (req, res, next) => {
  const { members, admin, creationDate } = req.body;

  if (!members) {
    return res.status(400).send("Missing  members");
  }

  if (!admin) {
    return res.status(400).send("Missing admin");
  }
  if (!creationDate) {
    return res.status(400).send("Missing creationDate");
  }
  if (!members.includes(admin)) {
    return res.status(400).send("Admin must be in members");
  }
  next();
};

module.exports = checkPostConvBody;
