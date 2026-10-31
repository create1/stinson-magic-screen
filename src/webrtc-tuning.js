// The Decart SDK publishes the camera through livekit-client, which pins camera senders to
// "maintain-framerate" (resolution drops first when the uplink is tight) and does not expose the
// sender. Lucy's output detail follows its input detail, so every video sender on this page is
// switched to keep resolution and drop frames instead.
const PREFERENCE = "maintain-resolution";

export function preferResolutionOnVideoSenders() {
  const proto = globalThis.RTCRtpSender?.prototype;
  if (!proto?.setParameters || proto.setParameters.__magicScreen) return;
  const original = proto.setParameters;
  const patched = function (params, ...rest) {
    if (this.track?.kind === "video" && params && typeof params === "object") {
      params.degradationPreference = PREFERENCE;
    }
    return original.call(this, params, ...rest);
  };
  patched.__magicScreen = true;
  proto.setParameters = patched;
}
