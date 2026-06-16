# Universal Links and App Links for Live Session QR

This document defines the production path for replacing custom-scheme live QR
links with standard HTTPS links.

## Goal

Use one reusable audience-facing QR URL per mode:

```text
https://mytopia.world/live/session?mode=production&sessionId=production-current&token=<join-token>
```

`https://www.mytopia.world/live/session?...` is also associated with the app so
links keep working if a scanner or browser normalizes to the `www` host.

The token is stable by default, so production theatre posters can remain printed
across multiple performances. When the app is installed, iOS Universal Links and
Android App Links should open the app directly. When the app is not installed,
the same URL should open a website fallback page that explains the app and links
to the store once store links are available.

The current custom scheme remains acceptable for development testing only.

## Why HTTPS Links

Universal Links/App Links are standard web URLs. They are easier for QR scanners,
messaging apps, browsers, and operating systems to recognize than a custom
scheme. Apple documents that Universal Links use one URL for both web and app,
are tied securely to the domain, and fall back to the website when the app is not
installed. Android App Links use the same idea with Android's verified links.

## Required Pieces

1. Website route:
   - `https://mytopia.world/live/session`
   - Reads `mode`, `sessionId`, and `token`.
   - Shows a fallback page when the app is not installed.
   - Explains that live joining is only possible during configured show windows.
   - Does not leak or log join tokens unnecessarily.

2. iOS association:
   - Host `/.well-known/apple-app-site-association` on `mytopia.world` and
     `www.mytopia.world`.
   - Include the Apple Team ID and iOS bundle identifier.
   - Include the live path, for example `/live/session*`.
   - Add the Associated Domains entitlement to the app:
     `applinks:mytopia.world` and `applinks:www.mytopia.world`.
   - Regenerate or refresh the App Store provisioning profile after enabling
     Associated Domains. OTA updates cannot add this entitlement.

3. Android association:
   - Host `/.well-known/assetlinks.json` on `mytopia.world` and
     `www.mytopia.world`.
   - Include the Android package name.
   - Include the SHA-256 certificate fingerprint for the release signing key.
   - Add an Android intent filter with `scheme: https`, `host:
     mytopia.world`, `pathPrefix: /live/session`, and `autoVerify: true`.
     The app config also includes the same filter for `www.mytopia.world`.

4. App route handling:
   - Map the HTTPS URL to the existing Expo Router live route.
   - Reuse the same `mode`, `sessionId`, and `token` join logic.
   - If a show window is active, join the deterministic current session.
   - If a future window exists, show the next live interaction time.
   - If no window exists, show a neutral unavailable state and return to the app.

## Expo Notes

Expo documents this as a two-way association:

- the website proves which apps may open the domain;
- the native app build proves which domains it is allowed to handle.

For this codebase, the app config needs the iOS associated domains and Android
intent filters. A native rebuild is required after changing these values; an OTA
update is not enough for new entitlements or intent filters.

## Website Fallback Page

The fallback page should be simple:

- identify the app as "Die App zu √Mytopia - Auferstanden aus Ruinen";
- explain that the link joins the live theatre interaction during scheduled
  show windows;
- show app store links when available;
- optionally provide a "try opening app" button that links back to the same URL.

Do not make the fallback page the primary show experience. The native app remains
the live interaction surface.

## Rollout Plan

1. Confirm production bundle identifiers:
   - iOS bundle ID;
   - Android package name;
   - Apple Team ID;
   - Android release SHA-256 fingerprint.
2. Add association files to `mytopia.world`.
3. Add iOS/Android app config entries.
4. Implement the `/live/session` website fallback route.
5. Switch reusable admin QR generation from the custom scheme to the HTTPS URL.
6. Build and install native TestFlight/internal Android builds.
7. Test from Camera, WhatsApp, Mail, Safari/Chrome, and QR scanner apps.

## Release Checklist

- Website env has `NEXT_PUBLIC_APP_JOIN_BASE_URL=https://mytopia.world`.
- Website env has `IOS_UNIVERSAL_LINK_APP_ID=<team-id>.<bundle-id>`.
- Website env has the Android package and release SHA-256 fingerprint.
- iOS TestFlight build is made after the App Store provisioning profile includes
  Associated Domains.
- Android internal build is made with the same signing certificate whose
  fingerprint is published in `assetlinks.json`.

## Known Caveats

- iOS may keep opening the website if the user explicitly chose Safari for that
  domain before. The app can usually be restored through the system "Open" affordance.
- Universal Links do not trigger when the app itself calls `openURL` for its own
  domain; this is expected OS behavior.
- Android verification depends on the exact release signing fingerprint.
- Association files must be served over HTTPS without redirects and with valid
  JSON content.

## References

- Apple: Support Universal Links
  <https://developer.apple.com/library/archive/documentation/General/Conceptual/AppSearch/UniversalLinks.html>
- Android Developers: About deep links and App Links
  <https://developer.android.com/training/app-links>
- Expo: iOS Universal Links
  <https://docs.expo.dev/linking/ios-universal-links/>
- Expo: Android App Links
  <https://docs.expo.dev/linking/android-app-links/>
