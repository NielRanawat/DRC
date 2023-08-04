// Require
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const app = express();
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')))

// Initializing session and passport
app.use(session({
    secret : process.env.PASSPORT_KEY,
    resave : false,
    saveUninitialized : false,
    cookie : {
        expires : 600000
    }
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
    username : {type : String , require : true},
    email : {type : String , require : true},
    name : {type : String , require : true},
    isAdmin : {type : Boolean , require : true , default : false},
    password : String
});

userSchema.plugin(passportLocalMongoose);
const User = new mongoose.model("User" , userSchema);

passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

const postSchema = new mongoose.Schema({
    title : {type : String , require : true},
    content : {type : String , require : true},
    // img : {type : String , require : true}
});

const Post = new mongoose.model("Post" , postSchema);

app.get("/register", function (req, res) {
    res.render("register");
});

app.post("/register", function (req, res) {
    User.register({username: req.body.username,  email: req.body.username, name: req.body.name} , req.body.password, function (err, user) {
        if (err) {
            console.log(err);
            // res.render("alerts/uaxerror");
        } else {
            passport.authenticate("local")(req, res, function () {
                res.redirect("/");
            });
        }
    });
});

app.post("/login", passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/badcred"
}), function (req, res) {
});

app.get('/login' , (req,res) => {
    res.render('login');
});

app.get("/logout" , (req , res) => {
    req.logout(function(err){
        if(err){
            console.log(err);
        }else{
            res.redirect("/login")
        }
    });
})

app.get("/" , function(req , res){
    
    Post.find({} , (err , foundPost) => {
        if(!err){
            if(req.isAuthenticated()){
                res.render("home" , {foundPost : foundPost , loggedIn : true});
            }else{
                res.render("home" , {foundPost : foundPost , loggedIn : false});
            }
        } else{
            console.log(err);
        }
    })
});

app.get('/get-arcticles/:article_id' , (req,res) => {
    Post.findOne({_id : req.params.article_id} , function(err , foundPost){
        if (!err) {
            if(req.isAuthenticated()){
                res.render("article" , {foundPost : foundPost , loggedIn : true});
            }else{
                res.render("article" , {foundPost : foundPost , loggedIn : false});
            }
        }
    });
});


app.get('/admin' , (req,res) => {
    if(req.isAuthenticated()){
        if(req.user.isAdmin){
            res.render('admin');
        } else{
            res.redirect("/");
        }
    } else{
        res.redirect("/login");
    }
});

app.post("/addpost" , (req , res) => {
    if(req.isAuthenticated()){
        if(req.user.isAdmin){
            const newPost = new Post({
                title : req.body.title,
                content : req.body.content,
                // img : req.body.image
            });
            newPost.save((err) => {
                if(err){
                    console.log(err);
                } else{
                    console.log("Saved");
                    res.redirect("/");
                }
            });
        } else{
            res.redirect("/");
        }
    } else{
        res.redirect("/login");
    }
});

connectDB().then(() => {
    console.log("DRC DB CONNECTED SUCCESFULLY");
    app.listen(process.env.PORT || 3000, () => {
        console.log("DRC SERVER STARTED");
    });
});

