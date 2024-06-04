const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../index"); // Assurez-vous que 'app' est le bon chemin
const User = require("../Models/User");

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe("User routes", () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  describe("POST /api/user", () => {
    it("should create a new user", async () => {
      const userData = {
        userName: "JohnDoe",
        mail: "johndoe@example.com",
      };

      const response = await request(app).post("/api/user/").send(userData);

      expect(response.status).toBe(201);
      expect(response.body.userName).toBe(userData.userName);
      expect(response.body.mail).toBe(userData.mail);
      expect(response.body.conversations).toEqual([]);
    });
  });

  describe("GET /api/user", () => {
    it("should get all users", async () => {
      const usersData = [
        { userName: "JohnDoe", mail: "johndoe@example.com" },
        { userName: "JaneDoe", mail: "janedoe@example.com" },
      ];

      await User.insertMany(usersData);

      const response = await request(app).get("/api/user");

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(2);
      expect(response.body[0].userName).toBe(usersData[0].userName);
      expect(response.body[1].userName).toBe(usersData[1].userName);
    });
  });

  describe("GET /api/user/username", () => {
    it("should get user info based on username query except conversations", async () => {
      const userData = {
        userName: "Ideein",
        mail: "ideein7@gmail.com",
      };
      await User.create(userData);

      const response = await request(app).get(
        "/api/user/username?search=Ideein"
      );

      expect(response.status).toBe(200);
      expect(response.body[0].userName).toBe(userData.userName);
      expect(response.body[0].mail).toBe(userData.mail);
      expect(response.body[0].conversations).toBeUndefined();
    });
  });

  describe("GET /api/user/mail/:mail", () => {
    it("should get user info based on email", async () => {
      const userData = {
        userName: "JohnDoe",
        mail: "johndoe@example.com",
      };
      await User.create(userData);

      const response = await request(app).get(
        `/api/user/mail/${userData.mail}`
      );

      expect(response.status).toBe(200);
      expect(response.body.userName).toBe(userData.userName);
    });
  });

  describe("GET /api/user/checkUserName/:userName", () => {
    it("should verify if the user exists based on username", async () => {
      const userData = {
        userName: "JohnDoe",
        mail: "johndoe@example.com",
      };
      await User.create(userData);

      const response = await request(app).get(
        `/api/user/checkUserName/${userData.userName}`
      );

      expect(response.status).toBe(200);
      expect(response.body.userExists).toBe(true);
    });

    it("should verify if the user does not exist based on username", async () => {
      const response = await request(app).get(
        "/api/user/checkUserName/NonExistentUser"
      );

      expect(response.status).toBe(200);
      expect(response.body.userExists).toBe(false);
    });
  });

  describe("GET /api/user/checkMail/:mail", () => {
    it("should verify if the user exists based on email", async () => {
      const userData = {
        userName: "JohnDoe",
        mail: "johndoe@example.com",
      };
      await User.create(userData);

      const response = await request(app).get(
        `/api/user/checkMail/${userData.mail}`
      );

      expect(response.status).toBe(200);
      expect(response.body.mailExists).toBe(true);
    });

    it("should verify if the user does not exist based on email", async () => {
      const response = await request(app).get(
        "/api/user/checkMail/nonexistent@example.com"
      );

      expect(response.status).toBe(200);
      expect(response.body.mailExists).toBe(false);
    });
  });

  describe("GET /api/user/userConversationsId/userId/:userId", () => {
    it("should get user conversations based on user ID", async () => {
      const userData = {
        userName: "JohnDoe",
        mail: "johndoe@example.com",
        conversations: ["conversation1", "conversation2"],
      };
    });
  });
});
