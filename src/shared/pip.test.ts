/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { installPictureInPictureUnlock, unlockAllVideos, unlockPictureInPicture } from "./pip";

describe("unlockPictureInPicture", () => {
  it("removes the real disablepictureinpicture attribute", () => {
    installPictureInPictureUnlock();
    const video = document.createElement("video");
    video.setAttribute("disablepictureinpicture", "");
    unlockPictureInPicture(video);

    expect(video.hasAttribute("disablepictureinpicture")).toBe(false);
  });

  it("keeps the attribute off when Netflix sets it through the prototype", () => {
    installPictureInPictureUnlock();
    const video = document.createElement("video");
    unlockPictureInPicture(video);

    Element.prototype.setAttribute.call(video, "disablepictureinpicture", "true");
    expect(video.hasAttribute("disablepictureinpicture")).toBe(false);

    video.disablePictureInPicture = true;
    expect(video.hasAttribute("disablepictureinpicture")).toBe(false);
    expect(video.disablePictureInPicture).toBe(false);
  });

  it("clears the lock on every video on the page", () => {
    installPictureInPictureUnlock();
    const first = document.createElement("video");
    const second = document.createElement("video");
    first.setAttribute("disablepictureinpicture", "");
    second.setAttribute("disablepictureinpicture", "");
    document.body.append(first, second);

    unlockAllVideos();

    expect(first.hasAttribute("disablepictureinpicture")).toBe(false);
    expect(second.hasAttribute("disablepictureinpicture")).toBe(false);
  });
});
