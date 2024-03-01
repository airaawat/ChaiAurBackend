require('dotenv').config({});
const connectDB = require('./db/db');
const express = require('express');
const app = require('./app');


const PORT = process.env.PORT || 3000

connectDB()
.then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on ${PORT}`);
    })
})
.catch((error) => {
    console.log("MongoDB connection failed", error);
})
