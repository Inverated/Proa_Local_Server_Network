

const mongoose = require("mongoose");
const { SOCSensor, SOCSensorCalibration } = require('./models')


const connectDB = async () => {
    try {
        await mongoose.connect('mongodb://127.0.0.1/proa_sensor_readings');
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
    }
};

module.exports = {
    connectDB
};