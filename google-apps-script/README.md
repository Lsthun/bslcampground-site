# Google Apps Script Reservation Backend

This folder contains a Google Apps Script web app for Bay St. Louis Campground reservation requests.

## What it does

- accepts the booking request form POST from the website
- emails the request to `bslrvpark@gmail.com`
- optionally sends a Telegram message to campground staff
- returns a JSON response so the website can show success or failure inline

## Files

- `Code.gs`: web app logic, email sending, Telegram notification helpers
- `appsscript.json`: Apps Script project manifest

## Required script properties

Set these in the Apps Script project under `Project Settings` -> `Script properties`:

- `RESERVATION_TO_EMAIL`: `bslrvpark@gmail.com`
- `TELEGRAM_BOT_TOKEN`: your Telegram bot token
- `TELEGRAM_CHAT_ID`: the chat ID that should receive alerts

Optional:

- `MAIL_FROM_NAME`: defaults to `Bay St. Louis Campground Website`

## Telegram setup

1. Start a chat with your bot and send it any message.
2. In the Apps Script editor, run `setTelegramChatIdFromLatestUpdate()`.
3. Approve the Google authorization prompts.
4. The script will store the latest Telegram chat ID into `TELEGRAM_CHAT_ID`.

If you want to inspect raw updates first, run `listTelegramUpdates()`.

## Deployment steps

1. Go to `https://script.google.com/` and create a new Apps Script project.
2. Replace the default code with `Code.gs` from this folder.
3. Replace the default manifest with `appsscript.json` from this folder.
4. Set the script properties listed above.
5. Run `sendTestReservationNotification()` once to confirm email and Telegram delivery.
6. Deploy as a web app:
   - Execute as: `Me`
   - Who has access: `Anyone`
7. Copy the deployed web app URL that ends in `/exec`.
8. Paste that URL into `/reservation-config.js` in this repo.
9. If you update an already-deployed project, redeploy the web app so the live `/exec` URL uses the latest code.

## Troubleshooting live delivery

- If the email body looks like an older generic template with fields such as `Name`, `Email`, `Phone`, `Arrival`, `Departure`, and `Message`, the live `/exec` URL is still pointing at an older Apps Script project or deployment.
- After replacing `Code.gs`, redeploy the web app before testing the website again. Updating code in the editor alone is not enough.
- The current scaffold identifies itself as version `2026-05-31f`. Visiting `/exec?mode=health` should return JSON that includes that version after redeploy.
- If website submissions arrive by email but Telegram is silent, run `runTelegramDiagnostics()` first. That will tell you whether the bot token is valid and whether the configured chat id is reachable.
- `runTelegramDiagnostics()`, `setTelegramChatIdFromLatestUpdate()`, and `sendTestReservationNotification()` now log their result text to the Apps Script execution log, so you do not need to inspect the return value separately.
- If diagnostics succeed but website submissions still do not alert Telegram, run `sendTestReservationNotification()` directly in Apps Script. If that fails, rerun `setTelegramChatIdFromLatestUpdate()` and verify the bot token and chat id in Script Properties.
- The subject line now includes the guest name, arrival date, and a short request reference, and the request id/reference were shortened for easier reading.

## Frontend hook

The website reads the deployed Apps Script URL from `/reservation-config.js`:

```js
window.BSLCampgroundReservationConfig = Object.freeze({
  appsScriptUrl: "https://script.google.com/macros/s/REPLACE_ME/exec",
  googleMapsApiKey: "REPLACE_WITH_GOOGLE_MAPS_API_KEY",
  googleMapsAutocompleteCountry: "us"
});
```

Once that file contains the real deployed URL, the reservation form will post directly to the Apps Script backend.

If you want Google-style address suggestions in the Home Address field, add a browser-restricted Google Maps API key to `googleMapsApiKey`. The key should be restricted to your live site domain and have Maps JavaScript / Places access enabled in Google Cloud.

## Notes

- Google Apps Script and Telegram bot delivery are free within platform quotas.
- Gmail sending limits still apply, so this is suitable for normal reservation volume, not bulk campaigns.