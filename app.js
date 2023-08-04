// Require
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const app = express();
const mongoose = require("mongoose");
const lodash = require("lodash");
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));
const path = require('path');
const { url } = require("inspector");
app.use(express.static(path.join(__dirname, 'public')))

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

const postSchema = new mongoose.Schema({
    title : {type : String , require : true},
    content : {type : String , require : true},
    // img : {type : String , require : true}
});

const Post = new mongoose.model("Post" , postSchema);

app.get("/" , function(req , res){
    Post.find({} , (err , foundPost) => {
        if(!err){
            res.render("home" , {foundPost : foundPost});
        } else{
            console.log(err);
        }
    })
});

app.get('/get-arcticles/:article_id' , (req,res) => {
    Post.findOne({_id : req.params.article_id} , function(err , foundPost){
        if (!err) {
            res.render("article" , {foundPost : foundPost});
        }
    });
});

app.get('/login' , (req,res) => {
    res.render('login');
});

app.get('/register' , (req,res) => {
    res.render('register');
});

app.get('/admin' , (req,res) => {
    res.render('admin');
});

app.post("/addpost" , (req , res) => {
    const newPost = new Post({
        title : req.body.title,
        content : req.body.content,
        // img : req.body.image
    })
    newPost.save((err) => {
        if(err){
            console.log(err);
        } else{
            console.log("Saved");
            res.redirect("/");
        }
    });
});

connectDB().then(() => {
    console.log("DRC DB CONNECTED SUCCESFULLY");
    app.listen(process.env.PORT || 3000, () => {
        console.log("DRC SERVER STARTED");
    });
});

