const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  // Extraire le token de l'en-tête Authorization
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).send("Access denied. No token provided.");

  try {
    // Vérifier et décoder le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userId: decoded }; // Attacher les informations de l'utilisateur à l'objet de la requête
    next();
  } catch (err) {
    res.status(400).send("Invalid token");
  }
};

const authAdmin = (req, res, next) => {
  // Extraire le token de l'en-tête Authorization
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  console.log(token);
  if (!token) return res.status(401).send("Access denied. No token provided.");
  try {
    // Vérifier et décoder le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET_ADMIN);
    req.user = { userId: decoded }; // Attacher les informations de l'utilisateur à l'objet de la requête
    next();
  } catch (err) {
    res.status(400).send("Invalid token");
  }
};

module.exports = { auth, authAdmin };
