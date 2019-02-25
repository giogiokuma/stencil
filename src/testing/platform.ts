import * as d from '@declarations';
export { Host, bootstrapLazy, createEvent, getElement, h } from '@runtime';
import { resetTaskQueue } from './task-queue';
import { resetWindow, setupGlobal } from '@mock-doc';

export * from './task-queue';

export const win = setupGlobal(global) as Window;

export const getWin = (_?: any) => win;

export const getDoc = (_?: any) => getWin().document;

export const getHead = (_?: any) => getDoc().head;

export const getBody = (_?: any) => getDoc().body;

const hostRefs = new Map<d.RuntimeRef, d.HostRef>();

export const rootAppliedStyles: d.RootAppliedStyleMap = new WeakMap();

export const styles: d.StyleMap = new Map();

export const plt: d.PlatformRuntime = {
  isTmpDisconnected: false,
  queueCongestion: 0,
  queuePending: false,
};

export const supportsShadowDom = true;

export const supportsListenerOptions = true;

export function resetPlatform() {
  resetWindow(win);
  hostRefs.clear();
  styles.clear();
  plt.isTmpDisconnected = false;

  resetTaskQueue();
}


export const getHostRef = (elm: d.RuntimeRef) =>
  hostRefs.get(elm);

export const registerInstance = (lazyInstance: any, hostRef: d.HostRef) =>
  hostRefs.set(hostRef.lazyInstance = lazyInstance, hostRef);

export const registerHost = (elm: d.HostElement) =>
  hostRefs.set(elm, {
    stateFlags: 0,
    hostElement: elm,
    instanceValues: new Map(),
  });

const Context = {
  isServer: false,
  enableListener: () => console.log('TODO'),
  queue: {}
};

export function getContext(context: string, elm: Node): any {
  if (context === 'window') {
    return getWin(elm);
  }
  if (context === 'document') {
    return getDoc(elm);
  }
  return (Context as any)[context];
}