const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL;

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(
  cors({
    origin: "http://localhost:3001", // Remplacez cela par l'URL de votre frontend
  })
);

// Connexion à la base de données
mongoose.connect(MONGO_URL);

// Obtenir l'objet de connexion
const db = mongoose.connection;

// Gérer les erreurs de connexion
db.on("error", console.error.bind(console, "Erreur de connexion à MongoDB:"));

// Connexion réussie
db.once("open", function () {
  console.log("Connecté à la base de données MongoDB");
  // Placez ici le code qui dépend de la connexion à la base de données
});

// Exporter la connexion pour l'utiliser dans d'autres parties de l'application si nécessaire
module.exports = db;

app.get("/", (req, res) => res.send("Hello World!"));

// WebSocket connection
io.on("connection", (socket) => {
  console.log("A user connected");
  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
});

server.listen(PORT, () =>
  console.log(`Example app listening at http://localhost:3000`)
);
