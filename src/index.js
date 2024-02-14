require('dotenv').config({path: './env'});
const connectDB = require('./db/db');
const express = require('express');
const app = express();


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
