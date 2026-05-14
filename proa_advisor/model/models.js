const mongoose = require("mongoose");
const Schema = mongoose.Schema
const ObjectId = Schema.ObjectId

//offset & calibration values be a seperate schema?

const SOCSensorSchema = new Schema({
    timeSinceSensorStart: { type: Number, required: true },
    adcReading1: { type: Number, required: true },
    adcReading2: { type: Number, required: true },
    adcReading3: { type: Number, required: true },
    adcReading1Adjusted: { type: Number, default: null, required: false },
    adcReading2Adjusted: { type: Number, default: null, required: false },
    adcReading3Adjusted: { type: Number, default: null, required: false },
    isAdjusted: { type: Boolean, default: false, required: true },
}, { timestamps: true })

const SOCLastOffsetSchema = new Schema({
    adcReading1Offset: { type: Number, default: 0, required: true },
    adcReading2Offset: { type: Number, default: 0, required: true },
    adcReading3Offset: { type: Number, default: 0, required: true },
}, { timestamps: true }) 

const BatteryStateSchema = new Schema({
    
    Soc: { type: Number, required: true, min: 0, max: 100 },


}, { timestamps: true })
module.exports = {
    SOCSensor: mongoose.model('SOCSensor', SOCSensorSchema),
    SOCLastOffset: mongoose.model('SOCLastOffset', SOCLastOffsetSchema),
    BatteryState: mongoose.model('BatteryState', BatteryStateSchema),
}