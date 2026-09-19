const PIP_LOCK = "disablepictureinpicture";

const nativeRemoveAttribute = Element.prototype.removeAttribute;
const nativeSetAttribute = Element.prototype.setAttribute;
const nativeSetAttributeNS = Element.prototype.setAttributeNS;
const nativeToggleAttribute = Element.prototype.toggleAttribute;

let installed = false;

function isPipLockName(name: string | null | undefined): boolean {
  return String(name).toLowerCase() === PIP_LOCK;
}

function stripDisableAttribute(video: HTMLVideoElement) {
  nativeRemoveAttribute.call(video, PIP_LOCK);
}

export function installPictureInPictureUnlock() {
  if (installed) return;
  installed = true;

  Element.prototype.setAttribute = function (name, value) {
    if (this instanceof HTMLVideoElement && isPipLockName(name)) {
      stripDisableAttribute(this);
      return;
    }
    return nativeSetAttribute.call(this, name, value);
  };

  Element.prototype.setAttributeNS = function (namespace, name, value) {
    if (this instanceof HTMLVideoElement && isPipLockName(name)) {
      stripDisableAttribute(this);
      return;
    }
    return nativeSetAttributeNS.call(this, namespace, name, value);
  };

  Element.prototype.toggleAttribute = function (name, force) {
    if (this instanceof HTMLVideoElement && isPipLockName(name)) {
      stripDisableAttribute(this);
      return false;
    }
    return nativeToggleAttribute.call(this, name, force);
  };

  try {
    Object.defineProperty(HTMLVideoElement.prototype, "disablePictureInPicture", {
      configurable: true,
      enumerable: true,
      get() {
        return false;
      },
      set() {
        nativeRemoveAttribute.call(this, PIP_LOCK);
      },
    });
  } catch {
    /* prototype may be non-configurable */
  }
}

export function unlockPictureInPicture(video: HTMLVideoElement) {
  installPictureInPictureUnlock();
  stripDisableAttribute(video);
}

export function unlockAllVideos(root: ParentNode = document) {
  installPictureInPictureUnlock();
  for (const video of collectVideos(root)) {
    stripDisableAttribute(video);
  }
}

function collectVideos(root: ParentNode): HTMLVideoElement[] {
  const found = new Set<HTMLVideoElement>();
  const visit = (node: ParentNode) => {
    if (node instanceof HTMLVideoElement) found.add(node);
    node.querySelectorAll?.("video").forEach((video) => found.add(video));
    node.querySelectorAll?.("*").forEach((element) => {
      if (element.shadowRoot) visit(element.shadowRoot);
    });
  };
  visit(root);
  return [...found];
}
