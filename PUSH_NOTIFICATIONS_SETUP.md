# PRIVATE LIFE · Push notifications

The code path for native Android push is implemented. Real delivery stays disabled until Firebase is configured.

## Android Firebase client

Create/register the Android app in Firebase with package:

`com.privatelife.game`

Populate `android/app/src/main/res/values/firebase.xml` from the Firebase Android configuration:

- `firebase_project_id`
- `firebase_gcm_sender_id` (Firebase project number / sender ID)
- `firebase_app_id`
- `firebase_api_key`

These are client configuration values. Do not put a service-account private key in the Android app.

## Server credentials on Render

Set these environment variables only on the PRIVATE LIFE Render web service:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `CRON_SECRET`

`FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` come from a Firebase/Google service account that can send Firebase Cloud Messaging messages.

Never commit the service-account JSON or private key to GitHub.

## Server heartbeat

The protected endpoint is:

`GET /api/push/tick`

Header:

`Authorization: Bearer <CRON_SECRET>`

It:
1. finds players with push-enabled Android devices;
2. skips players currently viewing the game;
3. advances the Life Engine for offline players;
4. delivers due Life Engine events;
5. delivers due delayed WhatsApp messages;
6. sends the corresponding data-only FCM push to Android.

A scheduler must call this endpoint periodically. Render Cron can do this, but it is a paid Render resource, so it should only be created deliberately.

## Device flow

1. Android asks for the system notification permission on first launch where required.
2. Firebase generates an FCM registration token.
3. The WebView passes the token to the logged-in PRIVATE LIFE account.
4. `POST /api/push/register` stores that device for the player.
5. Turning off notifications inside the game's Settings disables push for that device.
6. Push received while the APK is closed becomes a native Android notification.
7. The notification is also queued locally and injected into the virtual phone when PRIVATE LIFE opens again.

## Test checklist

- Install the newest APK.
- Allow notifications.
- Log in to a player account.
- Confirm the device appears in `private_life.push_devices`.
- Close PRIVATE LIFE.
- Trigger `/api/push/tick` with the correct `CRON_SECRET`.
- Confirm a due Life Engine or WhatsApp event produces an Android notification.
- Reopen PRIVATE LIFE and confirm the same event appears in the virtual phone notification history.
