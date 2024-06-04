const jwt = require("jsonwebtoken");

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).send("Access denied. No token provided.");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userId: decoded };
    next();
  } catch (err) {
    return res.status(400).send("Invalid token");
  }
};

/**
 * This function checks if the request has a valid JWT token for the admin.
 * If the token is valid, it sets the req.user object with the decoded token and proceeds to the next middleware or route handler.
 * If the token is invalid, it sends a response with a 400 status code and an error message.
 */
const authAdmin = async (req, res, next) => {
  // First, we check if the request has an authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    // If there is no authorization header, we return a 401 status code with an error message
    return res.status(401).send("Access denied. No token provided.");
  }
  // If the authorization header exists, we split it into two parts: the type (e.g. "Bearer ") and the token itself
  const token = authHeader.split(" ")[1];
  try {
    // We try to verify the token using the secret key stored in the environment variable JWT_SECRET_ADMIN
    const decoded = jwt.verify(token, process.env.JWT_SECRET_ADMIN);
    // If the token is valid, we set the req.user object with the decoded token and proceed to the next middleware or route handler
    req.user = { userId: decoded };
    next();
  } catch (err) {
    // If the token is invalid, we return a 400 status code with an error message
    res.status(400).send("Invalid token");
  }
};

module.exports = { auth, authAdmin };
