// update IS_TEST_RUN
const dotenv = require("dotenv");
dotenv.config();

function switchMode(mode) {
    const currentMode = process.env.IS_TEST_RUN === "true";
    const newMode = mode === "test";
    // Update the .env file
    const envFilePath = ".env";
    const envConfig = dotenv.parse(require("fs").readFileSync(envFilePath));
    envConfig.IS_TEST_RUN = newMode.toString();
    const newEnvContent = Object.entries(envConfig)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
    require("fs").writeFileSync(envFilePath, newEnvContent);
    // Update the process.env variable
    process.env.IS_TEST_RUN = newMode.toString();
    console.log(`Switched mode to ${newMode ? "test" : "normal"}`);
}

module.exports = {
    switchMode
};