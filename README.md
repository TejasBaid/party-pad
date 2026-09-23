# Party Pad 🎉

A couch party-game hub for the browser. The big screen (TV / laptop) runs the game; everyone's **phone is
the controller**. Three games share one lobby, one set of players and one QR code:

| Game | Mode | Controller |
|---|---|---|
| 🏎️ **Kart Party** | Versus, 1–4 players + bots, split screen | Phone as a steering wheel (tilt) or touch pad |
| 🍉 **Fruit Frenzy** | Versus, 1–4 players, 60–120 s rounds | Swing your phone like a sword (gyro "air mouse") or swipe |
| 🍕 **Pizza Party** | Co-op, 1–4 players, 5 days | Point your phone like a Wii remote, hold GRAB to carry |

**Kart Party** — 5 karts with equal stat budgets, 3 hilly tracks, drifting + mini-turbos, items, boost pads.

**Fruit Frenzy** — fruit flies up in waves; slice it with fast swings. Fruit really splits in half (with
juicy flesh caps and juice splats on the wall). Chain 3+ fruit in one swing for a combo bonus. Golden fruit is
worth 5, the pink banana starts a fruit frenzy, the frosty grapes trigger slow-mo — and bombs cost you 10 points
and stun your blade.

**Pizza Party** — customers walk in with orders. Grab a dough ball onto a peel, carry the sauce bottle over it
and scrub to paint sauce on, do the same with cheese (or shake your phone to sprinkle), drop on the toppings, then
slide it into the wood-fired oven — pull it out when the ring turns green, before it burns. Serve the right
customer for money and tips; angry customers cost a heart. Hit the day's money goals for up to 3 stars; Day 1 is
gentle, Day 5 is a dinner rush.

## Run it

```bash
npm install
npm start
```

Open **http://localhost:3000** on the big screen. Phones on the same Wi-Fi scan the QR code.

The phone link uses HTTPS (port 3443, self-signed certificate) because browsers only allow
motion sensors on secure pages. The first time, the phone shows a certificate warning:
tap *Show details → visit this website* (iOS) or *Advanced → Proceed* (Android). After that,
tilt steering works. Touch steering works without it.

### Deploy to Render

The repo includes a `render.yaml` blueprint. In the Render dashboard choose **New → Blueprint**, pick this repo,
and it creates a free Node web service (`npm ci` / `npm start`). Render provides HTTPS, so phones get motion
controls without any certificate warning and don't need to be on the same Wi-Fi. Open the service URL on the big
screen; the QR code points phones at the same address.

(Free Render services sleep after ~15 minutes idle, so the first load can take ~30 s.)

### Controls

**Pointer games (Fruit, Pizza):** phone = point (gyro) or touchpad + GRAB · mouse for keyboard player 1
(click/hold = GRAB) · arrows + `/` for player 2 · gamepad left stick + A.

**Kart Party:**

| | Phone | Keyboard P1 | Keyboard P2 | Gamepad |
|---|---|---|---|---|
| Steer | tilt / slide pad | A D | ← → | left stick / d-pad |
| Gas | automatic (toggle in lobby) | W | ↑ | RT / A |
| Brake / reverse | BRAKE | S | ↓ | LT / B |
| Drift (hold + steer) | DRIFT | Space | / | RB / LB |
| Use item | ITEM | E | . | X / Y |

In the lobby press **1** / **2** to add keyboard/mouse players, **A** on a gamepad to join, **Q**/**E** to switch game, **Enter** to start.
**M** toggles music, **F** fullscreen, **Esc** returns to the lobby.

## Credits

- Karts via [Poly Pizza](https://poly.pizza): *Racing car* and *Kart* by scaranto (CC0),
  *Go Kart* by Zsky (CC-BY 3.0), *Buggy* by Nick Slough (CC-BY 3.0), *Go kart* by Poly by Google (CC-BY 3.0)
- Nature: [Quaternius — Stylized Nature MegaKit](https://quaternius.com) (CC0)
- Track props, banana, cone, fruit & food, kitchen furniture, customers: [Kenney](https://kenney.nl) Racing Kit, Toy Car Kit, Car Kit, Food Kit, Furniture Kit, Mini Characters (CC0)
- Fonts: Lilita One, Nunito (SIL OFL)
