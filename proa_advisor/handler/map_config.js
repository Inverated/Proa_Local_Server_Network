
function getMapConfig() {
    const minLatitude = Number(process.env.MIN_LATITUDE);
    const maxLatitude = Number(process.env.MAX_LATITUDE);
    const minLongitude = Number(process.env.MIN_LONGITUDE);
    const maxLongitude = Number(process.env.MAX_LONGITUDE);
    const minZoom = Number(process.env.MIN_ZOOM);
    const maxZoom = Number(process.env.MAX_ZOOM);

    if (![minLatitude, maxLatitude, minLongitude, maxLongitude, minZoom, maxZoom].every(Number.isFinite)
        || minLatitude >= maxLatitude
        || minLongitude >= maxLongitude
        || minZoom > maxZoom) {
        throw new Error("Invalid map bounds or zoom configuration.");
    }

    return {
        center: [
            (minLatitude + maxLatitude) / 2,
            (minLongitude + maxLongitude) / 2,
        ],
        bounds: {
            south: minLatitude,
            west: minLongitude,
            north: maxLatitude,
            east: maxLongitude,
        },
        zoom: {
            initial: minZoom,
            min: minZoom,
            max: maxZoom,
        },
        tileUrl: "/map-tiles/{z}/{x}/{y}.png",
    };
}

module.exports = {
    getMapConfig,
};