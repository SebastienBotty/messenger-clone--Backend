const express = require("express");
const app = express();

const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
require("dotenv").config();
const {
  emitMsgToUsers,
  emitTypingToUsers,
  emitSeenMsgToUsers,
  emitMemberChangeToUsers,
  emitAdminChangeToUsers,
} = require("./SocketUtils");
//------------------Express
const conversationRouter = require("./Routes/Conversation");
const userRouter = require("./Routes/User");
const messageRouter = require("./Routes/Message");
const fileRouter = require("./Routes/File");

app.use(express.json({ limit: "50mb" }));
app.use(
  cors({
    origin: "http://localhost:3001", // Remplacez cela par l'URL de votre frontend
  })
);

app.use("/api/conversation", conversationRouter);
app.use("/api/user", userRouter);
app.use("/api/message", messageRouter);
app.use("/api/file", fileRouter);

//------------------Web Socket
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3001",
  },
});
// WebSocket connection
io.on("connection", (socket) => {
  console.log(socket.id + " connected");

  socket.on("typing", (data) => {
    // console.log(data);
    emitTypingToUsers(io, ...data);
  });
  socket.on("message", (data) => {

    emitMsgToUsers(io, ...data);
  });

  socket.on("seenMessage", (data) => {
    emitSeenMsgToUsers(io, ...data);
  });

  socket.on('membersChange', (data) => {
    emitMemberChangeToUsers(io, ...data)
  })

  socket.on("adminChange", (data) => {
    emitAdminChangeToUsers(io, ...data)
  })

  socket.on("disconnect", (socket) => {
    console.log(socket + " disconnected");
  });
});

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL;

//-----------------MongoDB
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

app.get("/", (req, res) => res.send("Hello World!"));

server.listen(PORT, () =>
  console.log(`Example app listening at http://localhost:3000`)
);

// Exporter la connexion pour l'utiliser dans d'autres parties de l'application si nécessaire

module.exports = app;
