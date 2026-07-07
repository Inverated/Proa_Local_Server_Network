# Structure

ExpressJs backend api + Serial reading

React frontend with MUI dashboard template

- https://github.com/mui/material-ui/tree/v9.0.1/docs/data/material/getting-started/templates/dashboard
- A shit template that mixes ts, js and tsx, jsx
- Shitter template with no organisation to the code

# How to run

1. Ensure you are cd into PROA_LOCAL_SERVER_NETWORK
2. Ensure npm is installed on your system
3. Run `npm run install:yarn`
4. Run `yarn start:all`
    - start:all will build the react app automatically and run Node.js with it
5. Open up the url `http://localhost:4000`


# Raspberry Pi 4 instruction

Using raspberry pi lite os so fast boot time in case of downtime. \
_UPS is included but having fast boot time and proper recover steps is a must_

## From new install (Raspberry Pi imager app)

1. Connect the pi to an external screen (micro HDMI) and keyboard
2. Log in with the user and password created during the imager setup
3. Run 
```ssh 
sudo systemctl enable ssh
sudo systemctl start ssh
```

## SSH into the pi from a different computer

1. For raspberry pi 4 and below (Check first), usb c is only for power. Require additional ethernet cable to connect

## Optimise boot time

1. Quick system setting with a GUI interface `sudo raspi-config`
2. Disable services for faster boot
```
sudo systemctl disable NetworkManager-wait-online.service
sudo systemctl mask NetworkManager-wait-online.service
sudo systemctl disable cloud-init-local.service
sudo systemctl disable cloud-init-main.service
sudo systemctl disable cloud-config.service
sudo systemctl disable cloud-final.service
sudo systemctl disable apt-daily-upgrade.service
sudo systemctl disable apt-daily.service
```

Still takes around 20s to boot up

## Download packages
```
sudo apt full-upgrade
sudo apt install git nodejs npm curl -y
sudo npm install yarn -g
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install --lts
nvm use node
```

Optional
```
sudo apt install tree vim -y
```

## Setting up git repo

```
git clone https://github.com/Inverated/Proa_Local_Server_Network advisor
cd advisor/
yarn install
yarn start:all
```
