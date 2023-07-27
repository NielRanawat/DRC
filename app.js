// Require
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const app = express();
const mongoose = require("mongoose");
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));
const path = require('path')
app.use(express.static(path.join(__dirname, 'public')))

app.get("/" , function(req , res){
    res.render("home");
});

app.get('/article' , (req,res) => {
    res.render('article');
});

app.listen(3000, function() {
    console.log("Server started on port 3000");
});

