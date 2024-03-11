// Require
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const app = express();
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
var randomstring = require("randomstring");
const session = require("express-session");
const MongoStore = require('connect-mongo')(session);
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');
const domain = process.env.DOMAIN;
const path = require('path');
const { error, log } = require("console");


// passport.serializeUser(function (user, done) {
//     done(null, user);
// });

// passport.deserializeUser(function (obj, done) {
//     done(null, obj);
// });

passport.serializeUser(function (user, done) {
    done(null, user.id)
});

passport.deserializeUser(function (id, done) {
     User.findById(id, function (err, user) { done(err, user); }); 
});


app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')))

// Initializing session and passport
app.use(session({
    secret: process.env.PASSPORT_KEY,
    resave: false,
    saveUninitialized: false,
    cookie: {
        expires: 2592000 //30 days
    },
    store: new MongoStore({ mongooseConnection: mongoose.connection })
}));

app.use(passport.initialize());
app.use(passport.session());

// MongoDB
mongoose.set("strictQuery", false);
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);

    } catch (error) {
        console.log(error);
        process.exit(1);
    }
};

const userSchema = new mongoose.Schema({
    username: { type: String, require: true, unique: true, },
    authType: { type: String, require: true, enum: ['local', 'google'] },
    email: { type: String, require: true, unique: true },
    name: { type: String, require: true },
    verified: { type: Boolean, require: true, default: false },
    isAdmin: { type: Boolean, require: true, default: false },
    password: String
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
},
    function (accessToken, refreshToken, profile, cb) {
        User.findOrCreate({ username: profile.id }, { email: profile.emails[0].value, name: profile.displayName, authType: "google", verified: true }, function (err, user, created) {
            if (err) {
                // throw new Error();
                return cb(null, false);
            }
            return cb(null, user);
        });
    }
));




passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

const postSchema = new mongoose.Schema({
    title: { type: String, require: true },
    content: { type: String, require: true },
    img_url: { type: String, require: true },
    author_name: { type: String, require: true },
    carouselHeading: { type: String, require: true, default: null },
    carousel_id: { type: Number, require: true, default: null },
    mainTag: { type: String, require: true, enum: ['f1', 'motogp', 'imsp', 'others', 'none'], default: 'none' },
    tags: [],
    status: { type: String, require: true, default: 'Pending', enum: ['Pending', 'Approved', 'Rejected'] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, {
    timestamps: true
});

const tokenSchema = new mongoose.Schema({
    userID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    token: { type: String, require: true },
    token_reason: { type: String, require: true, enum: ['email_validation', 'forgot_password'] },
}
    , {
        timestamps: true
    });

tokenSchema.index({ createdAt: 1 }, { expireAfterSeconds: 43200 });

const Post = new mongoose.model("Post", postSchema);
const Token = new mongoose.model("Token", tokenSchema);



async function sendEmail(userEmail, subject, body) {
    try {
        let mailTransporter = await nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.MAIL_ID,
                pass: process.env.MAIL_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        let details = {
            from: process.env.MAIL_ID,
            to: userEmail,
            subject: subject,
            html: body
        };

        await mailTransporter.sendMail(details);
    } catch (error) {
        console.error("Error sending email:", error);
        throw new Error("Error sending email");
    }
}

app.get("/register", function (req, res) {
    if (req.isAuthenticated()) {
        res.redirect('/');
    } else {
        res.render("register");
    }
});

app.get('/auth/google',
    passport.authenticate('google', { scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'], prompt: 'select_account' }));

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/register?userExists=1' }),
    function (req, res) {
        res.redirect('/');
    });

app.post("/register", async function (req, res) {
    User.register({ username: req.body.username, email: req.body.username, name: req.body.name, authType: 'local' }, req.body.password, function (err, user) {
        if (err) {
            console.log(err);
            if (err.name === 'UserExistsError' || err.code == '11000' || err.code == '11001') {
                res.redirect("/register?userExists=1");
            } else {
                console.log(err);
            }
        } else {
            passport.authenticate("local")(req, res, function () {
                const token = randomstring.generate({
                    length: 38,
                    charset: 'alphanumeric'
                });
                const newToken = new Token({
                    userID: req.user._id,
                    token: token,
                    token_reason: 'email_validation'
                });

                newToken.save(function (err) {
                    if (!err) {
                        res.redirect("/?newUser=1");
                        const link = `https://${domain}/verify/email_validation?token_id=${token}&token_reason=email_validation`
                        const userEmail = req.body.username;
                        const emailSubject = "Verify Email - DRC Account";
                        const emailBody = `<h4>Hey ${req.user.name}!</h4>
                        <p>Welcome to DRC community! We are thrilled to have you on board.
                      </p>
                            <p >Please click on the following link to verify your email address:</p>
                            <a href="${link}">Click here to verify.</a>
                        </p>
                        <p style="font-weight : bold;">Note : This link is valid only for 12 hours.</p>
                        <p>By verifying your email, you ensure that you receive important updates, notifications, and can fully participate in our platform.
                        </p>
                        <p>If you have any questions or need assistance, feel free to contact us at <span style="color : blue">desiracingco@gmail.com.</span>
                      </p>
                        <p>THIS IS A SYSTEM GENERATED MAIL. PLEASE DO NOT REPLY TO IT</p>
                        <p>Team DRC</p><p style="display : none">${link}</p>
                        `

                        sendEmail(userEmail, emailSubject, emailBody)
                            .then(successMessage => {
                                //message sent successfully
                            })
                            .catch(errorMessage => {
                                console.error(errorMessage);
                                throw new Error()
                            });
                    } else {
                        console.log(err);
                        throw new Error();
                    }
                });

            });
        }
    });
});



app.post("/login", function (req, res, next) {
    passport.authenticate("local", function (err, user, info) {
        if (err) { return next(err); }
        if (!user) {
            // Failed login attempt
            return res.redirect(`/login?wrongcredential=1&email=${req.body.username}`);
        }
        // Successful login attempt
        req.logIn(user, function (err) {
            if (err) { return next(err); }
            return res.redirect("/");
        });
    })(req, res, next);
});


app.get('/login', (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect("/profile");
    } else {
        res.render('login');
    }
});

app.get("/logout", (req, res) => {
    req.logout(function (err) {
        if (err) {
            console.log(err);
            throw new Error();
        } else {
            res.redirect("/login")
        }
    });
});

app.get('/verify/email_validation', async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            const foundToken = await Token.findOne({ token: req.query.token_id, token_reason: req.query.token_reason });
            if (foundToken != null) {
                const loggedInID = req.user._id.toString();
                const foundTokenUserID = foundToken.userID.toString();
                if (loggedInID === foundTokenUserID) {
                    const updatedUser = await User.findOneAndUpdate({ _id: foundToken.userID }, { verified: true });
                    const deleteToken = await Token.findOneAndDelete({ token: req.query.token_id });
                    res.render('email-validation-response', { response: true })
                } else {
                    res.render('404');
                }
            } else {
                res.render('email-validation-response', { response: false })
            }
        } catch (error) {
            console.log(error);
            throw new Error();
        }
    } else {
        res.redirect('/login');
    }
});

app.get('/email_validation/resend?', async (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.verified) {
            res.redirect('/')
        } else {
            const loggedInID = req.user._id.toString();
            const gotUserID = req.query.userID.toString();
            if (loggedInID == gotUserID) {
                const deleteToken = await Token.findOneAndDelete({ userID: req.user._id });
                const token = randomstring.generate({
                    length: 38,
                    charset: 'alphanumeric'
                });
                const newToken = new Token({
                    userID: req.user._id,
                    token: token,
                    token_reason: 'email_validation'
                });

                newToken.save(function (err) {
                    if (!err) {
                        res.redirect("/profile/card?returnMsg=emailResent");
                        const link = `https://${domain}/verify/email_validation?token_id=${token}&token_reason=email_validation`
                        const userEmail = req.user.email;
                        const emailSubject = "Re: Verify Email - DRC Account";

                        const emailBody = `<h4>Dear ${req.user.name},</h4>
                            <p>Please click on the following link to verify your email address:</p>
                            <a href="${link}">Click here to verify.</a>
                        </p>
                        <p style="font-weight : bold;">Note : This link is valid only for 12 hours.</p>
                        <p>By verifying your email, you ensure that you receive important updates, notifications, and can fully participate in our platform.
                        </p>
                        <p>If you have any questions or need assistance, feel free to contact us at <span style="color : blue">desiracingco@gmail.com.</span>
                      </p>
                        <p>THIS IS A SYSTEM GENERATED MAIL. PLEASE DO NOT REPLY TO IT</p>
                        <p>Team DRC</p><p style="display : none">${link}</p>`
                        sendEmail(userEmail, emailSubject, emailBody)
                            .then(successMessage => {
                                //message sent successfully
                            })
                            .catch(errorMessage => {
                                console.error(errorMessage);
                                throw new Error()
                            });
                    } else {
                        console.log(err);
                        throw new Error();
                    }
                });
            }
        }
    } else {
        res.redirect('/login');
    }
});

app.get('/forgot-password', async (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect('/');
    } else {
        res.render('forgot-password');
    }
});

app.post('/forgot-password', async (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect('/');
    } else {
        const foundUser = await User.findOne({ email: req.body.email });
        if (foundUser != null && foundUser.authType != 'google') {
            const deleteToken = await Token.findOneAndDelete({ userID: foundUser._id });
            const token = randomstring.generate({
                length: 38,
                charset: 'alphanumeric'
            });
            const newToken = new Token({
                userID: foundUser._id,
                token: token,
                token_reason: 'forgot_password'
            });

            newToken.save(function (err) {
                if (!err) {
                    res.redirect("/forgot-password?returnMsg=emailSent");
                    const link = `https://${domain}/verify/reset-password?token_id=${token}&token_reason=forgot_password`
                    const userEmail = foundUser.email;
                    const emailSubject = "Reset Password - DRC Account";
                    const emailBody = `<h4>Dear ${foundUser.name},</h4>
                  
                        <p>Please click on the following link to reset your password:
                  </p>
                        <a href="${link}">Click here to verify.</a>
                    </p>
                    <p style="font-weight : bold;">Note : This link is valid only for 12 hours.</p>
                    <p>If you have any questions or need assistance, feel free to contact us at <span style="color : blue">desiracingco@gmail.com.</span>
                  </p>
                    <p>THIS IS A SYSTEM GENERATED MAIL. PLEASE DO NOT REPLY TO IT</p>
                    <p>Team DRC</p>
                    <p style="display : none">${link}</p>`
                    sendEmail(userEmail, emailSubject, emailBody)
                        .then(successMessage => {
                            //message sent successfully
                        })
                        .catch(errorMessage => {
                            console.error(errorMessage);
                            throw new Error()
                        });
                } else {
                    console.log(err);
                    throw new Error();
                }
            });
        } else {
            res.redirect(`/forgot-password?returnMsg=emailSent&email=${req.body.email}`);
        }
    }
});

app.get('/verify/reset-password', async (req, res) => {
    try {
        const foundToken = await Token.findOne({ token: req.query.token_id, token_reason: req.query.token_reason });
        if (foundToken != null) {
            res.render('reset-password', { token: foundToken.token });
        } else {
            res.render('email-validation-response', { response: false })
        }
    } catch (error) {
        console.log(error);
        throw new Error();
    }
});

app.post('/reset-password', async (req, res) => {
    try {
        const foundToken = await Token.findOne({ token: req.body.token });
        if (foundToken != null) {
            const foundUser = await User.findOne({ _id: foundToken.userID });
            foundUser.setPassword(req.body.password1, async function () {
                await foundUser.save();
                const deleteToken = await Token.findOneAndDelete({ token: req.body.token });
                res.redirect("/forgot-password?returnMsg=passwordResetted");
            });
        } else {
            res.render('email-validation-response', { response: false })
        }
    } catch (error) {
        console.log(error);
        throw new Error();
    }
});

app.get("/", function (req, res) {
    Post.find({ status: 'Approved' }).sort({ createdAt: -1 }).exec((err, foundPost) => {
        if (!err) {
            if (req.isAuthenticated()) {
                let carousel1 = 0;
                let carousel1found = false;
                let carousel2 = 0;
                let carousel2found = false;
                let carousel3 = 0;
                let carousel3found = false;
                foundPost.forEach((post) => {
                    if (post.carousel_id == 1 && !carousel1found) {
                        carousel1 = post;
                        carousel1found = true;
                    }
                    if (post.carousel_id == 2 && !carousel2found) {
                        carousel2 = post;
                        carousel2found = true;
                    }
                    if (post.carousel_id == 3 && !carousel3found) {
                        carousel3 = post;
                        carousel3found = true;
                    }
                });
                res.render("home", { foundPost: foundPost, loggedIn: true, user: req.user.name, carousel1: carousel1, carousel2: carousel2, carousel3: carousel3 });
            } else {
                let carousel1 = 0;
                let carousel1found = false;
                let carousel2 = 0;
                let carousel2found = false;
                let carousel3 = 0;
                let carousel3found = false;
                foundPost.forEach((post) => {
                    if (post.carousel_id == 1 && !carousel1found) {
                        carousel1 = post;
                        carousel1found = true;
                    }
                    if (post.carousel_id == 2 && !carousel2found) {
                        carousel2 = post;
                        carousel2found = true;
                    }
                    if (post.carousel_id == 3 && !carousel3found) {
                        carousel3 = post;
                        carousel3found = true;
                    }
                });
                res.render("home", { foundPost: foundPost, loggedIn: false, user: null, carousel1: carousel1, carousel2: carousel2, carousel3: carousel3 });
            }
        } else {
            console.log(err);
            throw new Error();
        }
    });
});

app.get('/article/:article_id', async (req, res) => {
    Post.findOne({ _id: req.params.article_id }, async function (err, foundPost) {
        if (!err) {
            if (foundPost != null) {
                try {
                    const foundCatPosts = await Post.find({mainTag : foundPost.mainTag}).sort({ createdAt : -1 }).limit(8).exec();
                    if (req.isAuthenticated()) {
                        res.render("article", { foundPost: foundPost, catPost : foundCatPosts ,loggedIn: true, user: req.user.name, domain: process.env.DOMAIN });
                    } else {
                        res.render("article", { foundPost: foundPost, catPost : foundCatPosts ,loggedIn: false, user: null, domain: process.env.DOMAIN });
                    }
                } catch (error) {
                    console.log(error);
                    throw new Error();
                }
            } else {
                res.render('404');
            }
        } else {
            console.log(err);
            throw new Error();
        }
    });
});


app.get("/admin", (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.isAdmin) {
            res.render('admin');
        } else {
            res.redirect('/');
        }
    } else {
        res.redirect("/login");
    }
});

app.get('/profile', async (req, res) => {
    if (req.isAuthenticated()) {
        res.render('profile', { user: req.user.name, admin: req.user.isAdmin });
    } else {
        res.redirect('/login');
    }
});

app.get('/profile/card', async (req, res) => {
    if (req.isAuthenticated()) {
        res.render('profile-card', { user: req.user.name, profile: req.user });
    } else {
        res.redirect('/login');
    }
});

app.get('/add-post', (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.verified) {
            res.render('add-post', { user: req.user.name });
        } else {
            res.redirect('/profile/card?returnMsg=emailUnverified');
        }
    } else {
        res.redirect("/login");
    }
});

app.get("/articles-list", (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.isAdmin) {
            Post.find({ status: 'Approved' }).sort({ createdAt: -1 }).exec((err, foundPost) => {
                if (err) {
                    console.error(err);
                    throw new Error();
                } else {
                    res.render('articles-list', { foundPost: foundPost });
                }
            });
        } else {
            res.status(404).render("404");
        }
    } else {
        res.redirect("/login");
    }
});

app.post('/reject-post', async (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.isAdmin) {
            try {
                const updatePost = await Post.findOneAndUpdate({ _id: req.body.article_id, status: 'Pending' }, { status: 'Rejected' });
                res.redirect('/pending-articles?returnMsg=postRejected');
            } catch (error) {
                console.log(error);
                throw new Error();
            }
        } else {
            res.redirect('/');
        }
    } else {
        res.redirect('/login');
    }
});

app.post("/delete-post", (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.isAdmin) {
            console.log(req.body);
            Post.findOneAndDelete({ _id: req.body.article_id }, (err) => {
                if (!err) {
                    res.redirect("/articles-list?returnMsg=postDeleted")
                } else {
                    console.log(err);
                    throw new Error();
                }
            })
        } else {
            res.redirect('/');
        }
    } else {
        res.redirect("/login");
    }
});


app.get('/delete-article-confirmation/:article_id', async (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.isAdmin) {
            const foundArticle = await Post.findOne({ _id: req.params.article_id, status: 'Approved' });
            if (foundArticle != null) {
                res.render('delete-posts', { post: foundArticle });
            } else {
                res.render('404');
            }
        } else {
            res.redirect('/');
        }
    } else {
        res.redirect('/login');
    }
});

app.get('/view-pending-article?', async (req, res) => {
    if (req.isAuthenticated) {
        if (req.user.isAdmin) {
            try {
                const foundArticle = await Post.findOne({ _id: req.query.article_id, status: 'Pending' });
                if (foundArticle != null) {
                    res.render("unparticle", { post: foundArticle, source: 'admin' })
                } else {
                    res.render('404');
                }
            } catch (error) {
                console.log(error);
                throw new Error();
            }
        } else {
            res.redirect('/');
        }
    } else {
        res.redirect('/login');
    }
});

app.post("/add-post", (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.verified) {
            const newPost = new Post({
                title: req.body.title,
                content: req.body.content,
                img_url: req.body.img_url,
                author_name: req.body.author_name,
                createdBy: req.user._id
            });
            newPost.save((err) => {
                if (err) {
                    console.log(err);
                    throw new Error();
                } else {
                    res.redirect("/user-articles?returnMsg=postAdded")
                }
            });
        } else {
            res.redirect('/profile/card?returnMsg=emailUnverified');
        }
    } else {
        res.redirect("/login");
    }
});

app.get("/pending-articles", (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.isAdmin) {
            Post.find({ status: 'Pending' }, (err, foundPost) => {
                if (!err) {
                    res.render("pending-article", { foundPost: foundPost });
                } else {
                    console.log(err);
                    throw new Error();
                }
            });
        } else {
            res.status(404).render("404");
        }
    } else {
        res.redirect("/login");
    }
});

app.post("/approve-post", (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.isAdmin) {
            Post.findOne({ _id: req.body.id }, (err, foundPost) => {
                res.render("edit-post", { foundPost: foundPost });
            })
        } else {
            res.status(404).render("404");
        }
    } else {
        res.redirect("/login");
    }
});


app.get('/category?', async (req, res) => {
    const foundArticles = await Post.find({ status: 'Approved', mainTag: req.query.name }).sort({ createdAt: -1 });
    if (req.isAuthenticated()) {
        res.render("category", { foundPost: foundArticles, loggedIn: true, user: req.user.name, category: req.query.name });
    } else {
        res.render("category", { foundPost: foundArticles, loggedIn: false, user: null, category: req.query.name });
    }
});


app.get('/user-articles', async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            const foundPosts = await Post.find({ createdBy: req.user._id }).populate('createdBy').exec();
            res.render('user-articles', { foundPosts: foundPosts, user: req.user.name })
        } catch (error) {
            console.log(error);
            throw new Error();
        }
    } else {
        res.redirect('/login')
    }
});

app.get('/user-unpublished-article?', async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            const userID = (req.user._id).toString();
            const foundPost = await Post.findOne({ _id: req.query.article_id, createdBy: userID });
            if (foundPost != null) {
                res.render('unparticle', { post: foundPost, source: 'user' });
            } else {
                res.render('404');
            }
        } catch (error) {
            console.log(error);
            throw new Error();
        }
    } else {
        res.redirect('/login')
    }
});

app.post("/edit-post", (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.isAdmin) {
            const gotTagString = req.body.tags;
            const tagArray = gotTagString.split(',');
            Post.findOneAndUpdate({ _id: req.body.id }, { title: req.body.title, content: req.body.content, mainTag: req.body.mainTag, img_url: req.body.img_url, author_name: req.body.author_name, carousel_id: req.body.carousel_id, carouselHeading: req.body.carouselHeading, tags: tagArray, status: 'Approved' }, (err) => {
                if (err) {
                    console.log(err);
                    throw new Error();
                } else {
                    res.redirect("/articles-list?returnMsg=postPublished");
                }
            });
        } else {
            res.redirect('/');
        }
    } else {
        res.redirect("/login");
    }
});

app.get('/edit-post/:article_id', async (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.isAdmin) {
            try {
                const foundPost = await Post.findOne({ _id: req.params.article_id, status: 'Approved' });
                if (foundPost != null) {
                    res.render("edit-post", { foundPost: foundPost });
                } else {
                    res.render('404');
                }
            } catch (error) {
                console.log(error);
                throw new Error();
            }
        } else {
            res.redirect('/');
        }
    } else {
        res.redirect('/login');
    }
});

app.get('/about-us', (req, res) => {
    if (req.isAuthenticated()) {
        res.render('about-us', { user: req.user.name })
    } else {
        res.render('about-us', { user: null })
    }
});

app.use((req, res, next) => {
    res.status(404).render("404");
});

app.use((err, req, res, next) => {
    res.status(500).render('500');
});


connectDB().then(() => {
    console.log("DRC DB CONNECTED SUCCESFULLY");
    app.listen(process.env.PORT || 3000, () => {
        console.log("DRC SERVER STARTED");
    });
});


