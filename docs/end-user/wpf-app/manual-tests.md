# Manual Test Windows

These windows can be launched from the QC Wizard or directly from the Main Window “Test” buttons.

## Keyboard Test

Purpose: confirm all keys register correctly.

What to do:
- Press keys as instructed by the test window.
- Mark **Pass** if all keys register; otherwise **Fail**.

Practical tips:
- Use an external light source if key legends are worn.
- Pay special attention to commonly failing keys: space, enter, backspace, shift, trackpoint buttons (if present).
- If a key is physically missing or stuck, fail and document it in technician notes.

Troubleshooting:
- If nothing registers, ensure the test window has focus (click inside the window).

## Trackpad Test

Purpose: confirm trackpad movement and gestures/clicks.

What to do:
- Move the cursor and use click/scroll gestures as instructed.
- Mark **Pass** if behavior is correct; otherwise **Fail**.

Practical tips:
- Test both left and right click (if applicable).
- Test click-and-drag (this catches intermittent click issues).
- If the laptop has a trackpoint/nub + buttons, test them if the device is expected to support them.

Troubleshooting:
- If the cursor feels jumpy, clean the trackpad surface and try again.
- Check that “touchpad disabled while typing” style settings are not interfering (rare, but can happen).

## USB Port Test

Purpose: confirm expected number of USB ports work.

What to do:
- Set the **expected USB ports** count to the number of physical ports on the laptop.
- Click **Start Watching** (if shown), then plug/unplug a known-good USB device into each port.
- Mark complete when insertions are detected for all expected ports.

Best practices:
- Use the same known-good USB device for all ports (reduces false negatives).
- Test each physical port one-by-one; don’t assume adjacent ports behave the same.
- If a device is USB-C only, use a USB-C tester/dongle that your team trusts.

Troubleshooting:
- If insertions are not detected:
  - Try a different USB device (the USB stick may be bad).
  - Try flipping USB-C orientation (if applicable).
  - Check for physical debris/damage in the port.
  - If the port is loose or intermittent, fail and note which port.

## Audio & Video Test

Purpose: confirm speakers, microphone, headphone jack detection, and camera.

What to do:
- Play left/right speaker test tones and mark pass/fail.
- Record a short mic sample, play it back, and confirm clarity.
- Plug in headphones and confirm detection + audio.
- Open camera and confirm video feed.

Best practices:
- Set system volume to a consistent mid-high level so you catch distortion.
- For speakers:
  - Listen for crackling, imbalance (left louder than right), and missing frequency ranges.
- For microphone:
  - Record 3–5 seconds and listen for static or very low input.
- For headphone jack:
  - Confirm both detection *and* audio actually routes to the headphones.
- For camera:
  - Confirm the image is not black, frozen, or flickering.

Troubleshooting:
- If you hear nothing, confirm mute is off and the correct output device is selected.
- If mic playback is silent, confirm correct input device and that mic privacy settings allow access.

## Network Test (WiFi/Ethernet/Internet)

Purpose: confirm the device can connect.

What to do:
- Connect WiFi and/or plug in Ethernet.
- Run the network test and confirm WiFi/Ethernet/Internet status results.

Best practices:
- Prefer running at least one “real” internet check (not just adapter presence).
- If both WiFi and Ethernet exist on the device, test both when your process requires it.

Troubleshooting:
- If WiFi shows disconnected:
  - Confirm airplane mode is off.
  - Check that the WiFi adapter is enabled in OS settings/device manager.
  - Try toggling WiFi off/on.
- If Ethernet shows disconnected:
  - Try another cable/port.
  - Confirm the port LEDs show link (if the hardware provides them).
- If adapters are present but internet fails:
  - Check captive portals (hotel/guest networks).
  - Try a different network.
