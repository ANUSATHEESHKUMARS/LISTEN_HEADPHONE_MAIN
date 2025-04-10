import express from "express";
import path from "path";
import userRoutes from "./routes/userRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import connectDB from "./models/db.js";
import dotenv from "dotenv";
import session from "express-session";
import cookieParser from "cookie-parser";
import cors from "cors";
import Admin from "./models/adminModels.js";
import nocache from "nocache";
import errorHandler from "./middleware/errorMiddleware.js";
import initializeCategories from "./utils/initCategories.js";
import passport from "./config/passport.js";
import morgan from "morgan";
import helmet from "helmet";
import HTTP_STATUS from "./utils/httpStatusCodes.js";




dotenv.config();

const app = express();
  
connectDB();

const initializeAdmin = async () => {
  await Admin.createDefaultAdmin();
};
initializeAdmin().catch(console.error);

initializeCategories();

app.use(cors());

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(errorHandler);
app.use(cookieParser());
app.use(nocache());

app.use(morgan("dev"));

app.set("views", "./views");
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      secure: false,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(path.join(process.cwd(), "public")));

app.use("/user", userRoutes);
app.use("/admin", adminRoutes);
app.use("/", userRoutes);

app.use("*", (req, res) => {
  res.status(HTTP_STATUS.NOT_FOUND).render("partials/error");
});

app.listen(process.env.PORT, () => {
  console.log("Server running at port ");
});
