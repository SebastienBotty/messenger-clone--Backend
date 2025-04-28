const express = require("express");
const app = express();

const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const server = http.createServer(app);
require("dotenv").config();

const { initSocket } = require("./Config/Socket");

//------------------Express
const conversationRouter = require("./Routes/Conversation");
const userRouter = require("./Routes/User");
const messageRouter = require("./Routes/Message");
const fileRouter = require("./Routes/File");
const { pingTou } = require("./InterBackend");

initSocket(server);


app.use(express.json({ limit: "50mb" }));
app.use(
  cors({
    origin: [process.env.TOU_URL, process.env.FRONTEND_URL, process.env.PORTFOLIO_URL],
  })
);

app.use("/api/conversation", conversationRouter);
app.use("/api/user", userRouter);
app.use("/api/message", messageRouter);
app.use("/api/file", fileRouter);





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
app.get('/pingTest', (req, res) => {
  console.log("ping received ")
  res.send(true)
})

server.listen(PORT, () => {
  console.log(`Example app listening at http://localhost:3000`)
}
);

// Exporter la connexion pour l'utiliser dans d'autres parties de l'application si nécessaire

module.exports = { app };
