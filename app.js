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
    img_url : {type : String , require : true},
    author_name : {type : String , require : true},
    carouselHeading : {type : String , require : true , default : null},
    carousel_id : {type : Number , require : true , default : null},
    tags : [],
    approved : {type : Boolean , require : true , default : false}
},{
    timestamps: true
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
    Post.find({approved : true}).sort({ createdAt: -1 }).exec((err, foundPost) => {
    // Post.find((err, foundPost) => {
        if(!err){
            if(req.isAuthenticated()){
                let carousel1 = 0;
                let carousel1found = false;
                let carousel2 = 0;
                let carousel2found = false;
                let carousel3 = 0;
                let carousel3found = false;
                foundPost.forEach((post) => {
                    if(post.carousel_id == 1 && !carousel1found){
                        carousel1 = post;
                        carousel1found = true;
                    }
                    if(post.carousel_id == 2 && !carousel2found){
                        carousel2 = post;
                        carousel2found = true;
                    }
                    if(post.carousel_id == 3 && !carousel3found){
                        carousel3 = post;
                        carousel3found = true;
                    }
                });
                res.render("home" , {foundPost : foundPost , loggedIn : true ,user : req.user, carousel1 : carousel1 , carousel2 : carousel2 , carousel3 : carousel3});
            } else{
                let carousel1 = 0;
                let carousel1found = false;
                let carousel2 = 0;
                let carousel2found = false;
                let carousel3 = 0;
                let carousel3found = false;
                foundPost.forEach((post) => {
                    if(post.carousel_id == 1 && !carousel1found){
                        carousel1 = post;
                        carousel1found = true;
                    }
                    if(post.carousel_id == 2 && !carousel2found){
                        carousel2 = post;
                        carousel2found = true;
                    }
                    if(post.carousel_id == 3 && !carousel3found){
                        carousel3 = post;
                        carousel3found = true;
                    }
                });
                res.render("home" , {foundPost : foundPost , loggedIn : false , user : null , carousel1 : carousel1 , carousel2 : carousel2 , carousel3 : carousel3});
            }
        } else{
            console.log(err);
        }
    });
});

app.get('/get-arcticles/:article_id' , (req,res) => {
    Post.findOne({_id : req.params.article_id} , function(err , foundPost){
        const content = foundPost.content.split("\n");
        if (!err) {
            if(req.isAuthenticated()){
                res.render("article" , {foundPost : foundPost , content : content , loggedIn : true , user : req.user});
            }else{
                res.render("article" , {foundPost : foundPost , content : content , loggedIn : false , user : null});
            }
        }
    });
});

app.get("/badcred" , (req,res)=>{
    res.render("badcred");
});


app.get("/admin" , (req,res)=>{
    if(req.isAuthenticated()){
        if(req.user.isAdmin){
            res.render('admin');
        } else{
            res.status(404).render("404");
        }
    } else{
        res.redirect("/login");
    }
})

app.get('/add-post' , (req,res) => {
    if(req.isAuthenticated()){
            res.render('add-post');
    } else{
        res.redirect("/login");
    }
});

app.get("/delete-post" , (req,res) => {
    if(req.isAuthenticated()){
        if(req.user.isAdmin){
            Post.find().sort({ createdAt: -1 }).exec((err, foundPost) => {
                if (err) {
                  console.error(err);  
                } else {
                    res.render('delete-post' , {foundPost : foundPost});
                }                
            });
        } else{
            res.status(404).render("404");
        }
    } else{
        res.redirect("/login");
    } 
});

app.post("/delete-post" , (req,res) => {
    if(req.isAuthenticated()){
        if(req.user.isAdmin){
            Post.findOneAndDelete({_id : req.body.id} , (err)=>{
                if (!err) {
                    res.redirect("/delete-post")
                } else {
                    console.log(err);
                }
            })
        } else{
            res.status(404).render("404");
        }
    } else {
        res.redirect("/login");
    }
});

app.post("/add-post" , (req , res) => {
    if(req.isAuthenticated()){
            const newPost = new Post({
                title : req.body.title,
                content : req.body.content,
                img_url : req.body.img_url,
                author_name : req.body.author_name,
            });
            newPost.save((err) => {
                if(err){
                    console.log(err);
                } else{
                    res.redirect("/")
                }
            }); 
    } else{
        res.redirect("/login");
    }
});

app.get("/pending-articles" , (req , res) => {
    if(req.isAuthenticated()){
        if(req.user.isAdmin){
            Post.find({approved : false} , (err , foundPost)=>{
                if (!err) {
                    res.render("pending-article" , {foundPost : foundPost});
                } else {
                    console.log(err);
                }
            })
        } else{
            res.status(404).render("404");
        }
    } else {
        res.redirect("/login");
    }
});

app.post("/approve-post" , (req , res) => {
    if(req.isAuthenticated()){
        if(req.user.isAdmin){
            Post.findOne({_id : req.body.id} , (err , foundPost) => {
                res.render("edit-post" , {foundPost : foundPost});
            })
        } else{
            res.status(404).render("404");
        }
    } else {
        res.redirect("/login");
    }
});

app.get("/category?" , (req , res) => {
    if(req.isAuthenticated()){
        Post.find({approved : true , tags : req.query.category}).sort({ createdAt: -1 }).exec((err, foundPost) => {
            res.render("category" , {foundPost : foundPost , loggedIn : true , user : req.user , category : req.query.category});
        });        
    } else{
        Post.find({approved : true , tags : req.query.category}).sort({ createdAt: -1 }).exec((err, foundPost) => {
            res.render("category" , {foundPost : foundPost , loggedIn : false , user : null , category : req.query.category});
        });   
    }
});

app.post("/edit-post" , (req , res) => {
    if(req.isAuthenticated()){
        if(req.user.isAdmin){
            console.log(req.body.carousel_id);
            const gotTagString = req.body.tags;
            const tagArray = gotTagString.split(',');
            Post.findOneAndUpdate({_id : req.body.id} , {title : req.body.title , content : req.body.content, img_url : req.body.img_url , carousel_id : req.body.carousel_id , carouselHeading : req.body.carouselHeading , tags : tagArray , approved : true} , (err) => {
                if(err){
                    console.log(err);
                } else{
                    res.redirect("/pending-articles");
                }
            });
        } else{
            res.status(404).render("404");
        }
    } else {
        res.redirect("/login");
    }
});

app.use((req, res, next) => {
    res.status(404).render("404");
});

connectDB().then(() => {
    console.log("DRC DB CONNECTED SUCCESFULLY");
    app.listen(process.env.PORT || 3000, () => {
        console.log("DRC SERVER STARTED");
    });
});

