# Hosting ProofChain on IIS (office LAN)

IIS listens on port 80 and forwards each request to one of two Node apps that pm2 keeps running:

```
Browser  ->  IIS :80  --/api/*-->  NestJS backend   localhost:3002
                      --other--->  Next.js frontend localhost:3001
```

IIS does not run Node itself. It only forwards requests. The database is the local MySQL set in `.env.local`.

Steps 1–4 and 7 need administrator rights. You only do them once.

---

## 1. Turn on IIS

1. Press **Win**, type **Turn Windows features on or off**, and open it.
2. Tick **Internet Information Services**. The default sub-items are enough. Make sure
   **Web Management Tools → IIS Management Console** is ticked.
3. Click **OK** and wait. Restart if Windows asks.
4. Check: open <http://localhost>. You should see the blue IIS welcome page.

## 2. Install the two IIS add-ons

Download and install both. Run each installer and accept the defaults:

- **URL Rewrite 2.1**: <https://www.iis.net/downloads/microsoft/url-rewrite>
- **Application Request Routing (ARR) 3.0**: <https://www.iis.net/downloads/microsoft/application-request-routing>

Close IIS Manager and open it again after installing.

## 3. Switch on ARR's proxy

1. Open **IIS Manager**: press **Win** and type `inetmgr`.
2. In the left tree, click the **server name** at the top (your PC's name, not a site).
3. Double-click **Application Request Routing Cache**.
4. In the right panel, click **Server Proxy Settings…**.
5. Tick **Enable proxy**, then click **Apply** in the right panel.

## 4. Create the site

1. In IIS Manager, expand the server and then **Sites**.
2. Right-click **Default Web Site**, choose **Manage Website**, then **Stop**. It is using port 80.
3. Right-click **Sites** and choose **Add Website…**:
   - **Site name:** `ProofChain`
   - **Physical path:** `E:\sales\sales\proofchain\deploy\iis` (this folder holds the `web.config` with the forwarding rules)
   - **Binding:** type `http`, IP address `All Unassigned`, port `80`, host name left empty
4. Click **OK**.

## 5. Build the apps

Stop any `npm run dev` / `start:dev` windows first, because they use ports 3001 and 3002.

```powershell
cd E:\sales\sales\proofchain
npm run build                 # backend -> dist/

cd frontend
npm run build                 # frontend -> .next/
```

## 6. Start the apps with pm2

```powershell
cd E:\sales\sales\proofchain
pm2 start ecosystem.config.js
pm2 save
pm2 ls                        # both should show "online"
```

Check on this PC:

- <http://localhost>: the app should load.
- <http://localhost/api/health>: should show `"database":{"status":"up"}`.

## 7. Let other devices in (firewall)

1. Press **Win**, type **Windows Defender Firewall with Advanced Security**, and open it.
2. Click **Inbound Rules**, then **New Rule…**.
3. Choose **Port** → **TCP**, specific port `80` → **Allow the connection**.
4. Profiles: tick **Domain** and **Private** only. Leave **Public** unticked.
5. Name: `ProofChain IIS (port 80)` → **Finish**.

Your office network must be set as **Private**. To check, go to **Settings → Network & internet → Wi-Fi/Ethernet → (your network) → Network profile type**.

Then, from a phone or another PC on the same network, open **http://192.168.1.16**.

> The address `192.168.1.16` can change when the PC restarts. To keep it fixed, reserve it for this PC in
> your router's DHCP settings.

## 8. After a PC restart

pm2 does not start by itself on Windows. After a restart, run:

```powershell
pm2 resurrect
```

To make this automatic, set up **Task Scheduler**:

1. Open **Create Task…**.
2. Under **Triggers**, add **At log on**.
3. Under **Actions**, add **Start a program** with program `pm2` and arguments `resurrect`.

## Updating to new code

```powershell
cd E:\sales\sales\proofchain
git pull
npm run build
cd frontend; npm run build; cd ..
pm2 restart all
```

## Problems

| You see | Cause / fix |
|---|---|
| **HTTP Error 500.19** | URL Rewrite is not installed (step 2). If the message says *insufficient permissions*, give the **IIS_IUSRS** group *Read* access to the `deploy\iis` folder. |
| **404 page from IIS** | ARR's proxy is off (step 3), or the site points at the wrong folder (step 4). |
| **502.3 Bad Gateway** | A Node app is down. Run `pm2 ls` and `pm2 logs` to see why. |
| Works on this PC, not on phone | Firewall rule (step 7), network profile set to Public, or the IP changed. |
| `/api/health` shows database down | Check MySQL80 is running and the password in `.env.local`. |
