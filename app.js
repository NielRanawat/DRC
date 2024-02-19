// Require
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const app = express();
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require('connect-mongo')(session);
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
const path = require('path');
const { type } = require("os");
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
    username: { type: String, require: true },
    email: { type: String, require: true },
    name: { type: String, require: true },
    isAdmin: { type: Boolean, require: true, default: false },
    password: String
});

userSchema.plugin(passportLocalMongoose);
const User = new mongoose.model("User", userSchema);

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
    mainTag: { type: String, require: true, enum: ['f1', 'motogp', 'imsp' , 'none'] , default : 'none' },
    tags: [],
    status: { type: String, require: true, default: 'Pending', enum: ['Pending', 'Approved', 'Rejected'] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, {
    timestamps: true
});


const Post = new mongoose.model("Post", postSchema);

app.get("/register", function (req, res) {
    if(req.isAuthenticated()){
        res.redirect('/');
    } else {
        res.render("register");
    }
});

app.post("/register", function (req, res) {
    User.register({ username: req.body.username, email: req.body.username, name: req.body.name }, req.body.password, function (err, user) {
        if (err) {
            console.log(err);
            if(err.name === 'UserExistsError'){
                res.redirect("/register?userExists=1");
            } else {
                throw new Error();
            }
        } else {
            passport.authenticate("local")(req, res, function () {
                res.redirect("/");
            });
        }
    });
});

app.post("/login", passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login?wrongcredential=1"
}), function (req, res) {
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
                res.render("home", { foundPost: foundPost, loggedIn: true, user : req.user.name, carousel1: carousel1, carousel2: carousel2, carousel3: carousel3 });
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

app.get('/article/:article_id', (req, res) => {
    Post.findOne({ _id: req.params.article_id }, function (err, foundPost) {
        if (!err) {
            if(foundPost != null) {
                if (req.isAuthenticated()) {
                    res.render("article", { foundPost: foundPost, loggedIn: true, user : req.user.name });
                } else {
                    res.render("article", { foundPost: foundPost, loggedIn: false, user: null });
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
        res.render('profile', { user : req.user.name, admin: req.user.isAdmin });
    } else {
        res.redirect('/login');
    }
});

app.get('/add-post', (req, res) => {
    if (req.isAuthenticated()) {
        res.render('add-post' , {user : req.user.name});
    } else {
        res.redirect("/login");
    }
});

app.get("/articles-list", (req, res) => {
    if (req.isAuthenticated()) {
        if (req.user.isAdmin) {
            Post.find({status : 'Approved'}).sort({ createdAt: -1 }).exec((err, foundPost) => {
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

app.post('/reject-post' , async (req,res) => {
    if(req.isAuthenticated()){
        if(req.user.isAdmin){
            try {
                const updatePost = await Post.findOneAndUpdate({_id : req.body.article_id , status : 'Pending'} , {status : 'Rejected'});
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
                    res.render("unparticle", { post: foundArticle , source : 'admin' })
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
        res.render("category", { foundPost: foundArticles, loggedIn: true, user : req.user.name, category: req.query.name });
    } else {
        res.render("category", { foundPost: foundArticles, loggedIn: false, user: null, category: req.query.name });
    }
});


app.get('/user-articles', async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            const foundPosts = await Post.find({ createdBy: req.user._id }).populate('createdBy').exec();
            res.render('user-articles', { foundPosts: foundPosts , user : req.user.name})
        } catch (error) {
            console.log(error);
            throw new Error();
        }
    } else {
        res.redirect('/login')
    }
});

app.get('/user-unpublished-article/:article_id', async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            const foundPost = await Post.findOne({ _id : req.params.article_id , createdBy : req.user._id  });
            if(foundPost != null){
                res.render('unparticle', { post : foundPost ,source : 'user'});
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
            Post.findOneAndUpdate({ _id: req.body.id }, { title: req.body.title, content: req.body.content, mainTag : req.body.mainTag, img_url: req.body.img_url, author_name: req.body.author_name, carousel_id: req.body.carousel_id, carouselHeading: req.body.carouselHeading, tags: tagArray, status: 'Approved' }, (err) => {
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

app.get('/about-us' , (req,res) => {
    if(req.isAuthenticated()){
        res.render('about-us' , {user : req.user.name})
    } else {
        res.render('about-us' , {user : null})
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


