const mongoose = require("mongoose");
const Schema = mongoose.Schema
const ObjectId = Schema.ObjectId

//offset & calibration values be a seperate schema?

const SOCSensorSchema = new Schema({
    timeSinceSensorStart: { type: Number, required: true },
    adcReading1: { type: Number, required: true },
    adcReading2: { type: Number, required: true },
    adcReading3: { type: Number, required: true },
    adcReading1Adjusted: { type: Number, default: null, required: true },
    adcReading2Adjusted: { type: Number, default: null, required: true },
    adcReading3Adjusted: { type: Number, default: null, required: true },
    isAdjusted: { type: Boolean, default: false, required: true },
}, { timestamps: true })

const SOCSensorCalibrationSchema = new Schema({
    adcReading1Offset: { type: Number, required: true },
    adcReading2Offset: { type: Number, required: true },
    adcReading3Offset: { type: Number, required: true },
}, { timestamps: true }) 





module.exports = {
    SOCSensor: mongoose.model('SOCSensor', SOCSensorSchema),
    SOCSensorCalibration: mongoose.model('SOCSensorCalibration', SOCSensorCalibrationSchema),
}