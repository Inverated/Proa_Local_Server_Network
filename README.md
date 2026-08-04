# Structure

ExpressJs backend api + Serial reading

React frontend with MUI dashboard template

- https://github.com/mui/material-ui/tree/v9.0.1/docs/data/material/getting-started/templates/dashboard
- A shit template that mixes ts, js and tsx, jsx
- Shitter template with no organisation to the code


# Proa Local Server Network — Setup Guide

## Part 1: Running the App

1. `cd` into `PROA_LOCAL_SERVER_NETWORK`.
2. Ensure npm is installed on your system.
3. Run `npm run install:yarn`.
4. Run `yarn start:all`.
   - This automatically builds the React app and runs it with Node.js.
5. Open `http://localhost:4000` in your browser.

---

## Part 2: Raspberry Pi 4 Setup

Using Raspberry Pi Lite OS for fast boot time in case of downtime.
> A UPS is included, but fast boot time and proper recovery steps are still essential.

### 2.1 Initial Setup (from a fresh install via Raspberry Pi Imager)

If ssh does not work, you may need to connect the Pi to an external screen and keyboard to enable it.
1. Connect the Pi to an external screen (micro HDMI) and keyboard.
2. Log in with the username and password created during Imager setup.
3. Enable and start SSH:
   ```bash
   sudo systemctl enable ssh
   sudo systemctl start ssh
   ```

### 2.2 SSH into the Pi from Another Computer

1. On Raspberry Pi 4 and below (check your model first), the USB-C port is power-only — you'll need an additional Ethernet cable to connect.

### 2.3 Optimize Boot Time

1. Open the quick system settings GUI to connect to a WiFi network for update purposes:
   ```bash
   sudo raspi-config
   ```
2. Disable unneeded services for a faster boot:
   ```bash
   sudo systemctl disable NetworkManager-wait-online.service
   sudo systemctl mask NetworkManager-wait-online.service
   sudo systemctl disable cloud-init-local.service
   sudo systemctl disable cloud-init-main.service
   sudo systemctl disable cloud-config.service
   sudo systemctl disable cloud-final.service
   sudo systemctl disable apt-daily-upgrade.service
   sudo systemctl disable apt-daily.service
   ```
3. Note: boot time will still be around 20 seconds.

### 2.4 Download Required Packages

1. Update and install system packages:
   ```bash
   sudo apt full-upgrade
   sudo apt install git nodejs npm curl hostapd dnsmasq dhcpcd5 iptables -y
   sudo npm install yarn -g
   ```
2. Install nvm and Node LTS:
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   source ~/.bashrc
   nvm install --lts
   nvm use node
   ```

### 2.5 Set Up the Git Repo

1. Create a directory and clone the repo:
   ```bash
   mkdir apps
   cd apps
   git clone https://github.com/Inverated/Proa_Local_Server_Network advisor
   cd advisor/
   yarn install
   yarn start:all
   ```
2. Force-stop the process once the initial build completes.

### 2.6 Set Up the Network (Wi-Fi Access Point)

1. Get the Pi's IP address:
   ```bash
   hostname -I
   ```
2. Stop the AP-related services before configuring them:
   ```bash
   sudo systemctl stop hostapd
   sudo systemctl stop dnsmasq
   ```
3. Mark `wlan0` as unmanaged by NetworkManager. Edit:
   ```bash
   sudo nano /etc/NetworkManager/conf.d/unmanaged.conf
   ```
   Add:
   ```ini
   [keyfile]
   unmanaged-devices=interface-name:wlan0
   ```
4. Set a static IP for `wlan0`. Edit:
   ```bash
   sudo nano /etc/dhcpcd.conf
   ```
   Add:
   ```ini
   interface wlan0
   static ip_address=192.168.4.1/24
   nohook wpa_supplicant
   ```
5. Restart the dhcpcd service:
   ```bash
   sudo systemctl restart dhcpcd
   ```
6. Configure hostapd. Edit:
   ```bash
   sudo nano /etc/hostapd/hostapd.conf
   ```
   Add:
   ```ini
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
7. Point the hostapd daemon at that config. Edit:
   ```bash
   sudo nano /etc/default/hostapd
   ```
   Add:
   ```ini
   DAEMON_CONF="/etc/hostapd/hostapd.conf"
   ```
8. Back up and replace the dnsmasq config:
   ```bash
   sudo mv /etc/dnsmasq.conf /etc/dnsmasq.conf.orig
   sudo nano /etc/dnsmasq.conf
   ```
   Add:
   ```ini
   interface=wlan0

   dhcp-range=192.168.4.2,192.168.4.100,255.255.255.0,24h

   dhcp-option=3,192.168.4.1
   dhcp-option=6,192.168.4.1

   address=/#/192.168.4.1
   ```
9. Unmask and enable the AP services, then restart networking and start them:
   ```bash
   sudo systemctl unmask hostapd
   sudo systemctl enable hostapd
   sudo systemctl enable dnsmasq

   sudo systemctl restart wpa_supplicant
   sudo systemctl restart NetworkManager
   sudo systemctl start hostapd
   sudo systemctl start dnsmasq
   ```
10. Verify `wlan0` is running in AP mode:
    ```bash
    iw dev wlan0 info
    ```
    If the type isn't `AP`, run `sudo reboot` and check again.

### 2.7 Auto-Redirect Port 80 to the App (Port 4000)

1. Create the redirect service:
   ```bash
   sudo nano /etc/systemd/system/solarproa-redirect-connection.service
   ```
   Add:
   ```ini
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
2. Enable and start it:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable solarproa-redirect-connection
   sudo systemctl start solarproa-redirect-connection
   ```

### 2.8 Set Up Auto-Start on Boot

1. Create the app service:
   ```bash
   sudo nano /etc/systemd/system/solarproa-advisor.service
   ```
   Add:
   ```ini
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
2. Enable and start it:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable solarproa-advisor
   sudo systemctl start solarproa-advisor
   ```
3. Check the logs:
   ```bash
   journalctl -u solarproa-advisor -f
   ```

### 2.9 Note: AP vs. Wi-Fi Receiver Mode

The Wi-Fi chip can only act as **either** an access point **or** a receiver at one time — switch back to receiving, or use an external Wi-Fi adapter.

1. Check the new Wi-Fi receiver's interface name (should be `wlan1`).
2. Connect to a network on that interface:
   ```bash
   sudo nmcli device wifi connect "YourSSID" password "YourPassword" ifname wlan1
   ```
