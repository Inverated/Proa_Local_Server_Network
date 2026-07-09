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
sudo apt install git nodejs npm curl hostapd dnsmasq dhcpcd5 iptables -y
sudo npm install yarn -g
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install --lts
nvm use node
```

## Setting up git repo

```
mkdir apps
cd apps
git clone https://github.com/Inverated/Proa_Local_Server_Network advisor
cd advisor/
yarn install
yarn start:all
```

Force stop once initial build completes

## Setting up network

Get ip address
```
hostname -I
```

```
sudo systemctl stop hostapd
sudo systemctl stop dnsmasq
```

```
sudo nano /etc/NetworkManager/conf.d/unmanaged.conf
```

```
[keyfile]
unmanaged-devices=interface-name:wlan0
```

`sudo nano /etc/dhcpcd.conf`

```
interface wlan0
static ip_address=192.168.4.1/24
nohook wpa_supplicant
```

```
sudo systemctl restart dhcpcd
```

`sudo nano /etc/hostapd/hostapd.conf`
```
interface=wlan0
driver=nl80211

ssid=Proa_II

hw_mode=g
channel=6

country_code=SG

wmm_enabled=1

auth_algs=1
ignore_broadcast_ssid=0

wpa=2
wpa_passphrase=password

wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
```

`sudo nano /etc/default/hostapd`
```
DAEMON_CONF="/etc/hostapd/hostapd.conf"
```

```
sudo mv /etc/dnsmasq.conf /etc/dnsmasq.conf.orig
sudo nano /etc/dnsmasq.conf
```

```
interface=wlan0

dhcp-range=192.168.4.2,192.168.4.100,255.255.255.0,24h

dhcp-option=3,192.168.4.1
dhcp-option=6,192.168.4.1

address=/#/192.168.4.1
```

```
sudo systemctl unmask hostapd
sudo systemctl enable hostapd
sudo systemctl enable dnsmasq

sudo systemctl restart wpa_supplicant
sudo systemctl restart NetworkManager
sudo systemctl start hostapd
sudo systemctl start dnsmasq

```

`iw dev wlan0 info`
Check if type for wlan0 is AP. If not, sudo reboot and check this again

## auto connect / redirect anywhere.com
`sudo nano /etc/systemd/system/solarproa-redirect-connection.service`

```
[Unit]
Description=Redirect HTTP port 80 to Advisor port 4000
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c '/usr/sbin/iptables -t nat -C PREROUTING -i wlan0 -p tcp --dport 80 -j REDIRECT --to-ports 4000 || /usr/sbin/iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 80 -j REDIRECT --to-ports 4000'
ExecStop=/bin/sh -c '/usr/sbin/iptables -t nat -D PREROUTING -i wlan0 -p tcp --dport 80 -j REDIRECT --to-ports 4000 || true'

[Install]
WantedBy=multi-user.target
```

```
sudo systemctl daemon-reload
sudo systemctl enable solarproa-redirect-connection
sudo systemctl start solarproa-redirect-connection
```


## auto start

`sudo nano /etc/systemd/system/solarproa-advisor.service`

```nano
[Unit]
Description=Solar Proa Advisor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=admin
WorkingDirectory=/home/admin/apps/advisor/proa_advisor
ExecStart=/usr/admin/local/bin/yarn start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```
sudo systemctl daemon-reload
sudo systemctl enable solarproa-advisor
sudo systemctl start solarproa-advisor
journalctl -u solarproa-advisor -f

```

Check log
```
journalctl -u solarproa-advisor -f
```


chip can only be either an access point or a receiver. either switch back to receiving or use external wifi.
Check new wifi receiver name (should be wlan1)
```
sudo nmcli device wifi connect "YourSSID" password "YourPassword" ifname wlan1
```


## update & restart
Use the latest. Local should not be updated
```
cd apps/advisor
git reset --hard
git pull
yarn rebuild
sudo reboot
```

